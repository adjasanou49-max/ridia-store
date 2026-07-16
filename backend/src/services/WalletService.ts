import { WalletTransactionType, PaymentProvider } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';

/**
 * Wallet = solde de crédit interne uniquement. Alimenté par les dépôts du
 * client, les remboursements, et les bonus admin - jamais retirable en
 * argent réel, utilisable exclusivement pour payer des commandes sur Ridia
 * Store (pas de fonction de retrait, volontairement).
 */
export class WalletService {
  async getOrCreateWallet(userId: string) {
    return prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return Number(wallet.balanceXof);
  }

  async getHistory(userId: string, take = 30) {
    const wallet = await this.getOrCreateWallet(userId);
    return prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Crédite le wallet (dépôt confirmé, remboursement, bonus admin). */
  async credit(
    userId: string,
    amountXof: number,
    type: Extract<WalletTransactionType, 'CREDIT_TOPUP' | 'CREDIT_REFUND' | 'CREDIT_ADMIN'>,
    reason: string,
    referenceId?: string
  ) {
    if (amountXof <= 0) throw new AppError('Le montant à créditer doit être positif', 422);

    const wallet = await this.getOrCreateWallet(userId);

    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balanceXof: { increment: amountXof } },
      }),
      prisma.walletTransaction.create({
        data: { walletId: wallet.id, amountXof, type, reason, referenceId },
      }),
    ]);
  }

  /**
   * Débite le wallet pour une dépense (paiement de commande, correction admin).
   *
   * Suit le même schéma anti-race-condition que LoyaltyService.redeemPoints
   * (déjà audité et corrigé cette session) : le débit est conditionné
   * directement dans l'écriture, jamais un simple lire-puis-écrire.
   */
  async debit(
    userId: string,
    amountXof: number,
    type: Extract<WalletTransactionType, 'DEBIT_ORDER_PAYMENT' | 'DEBIT_ADMIN'>,
    reason: string,
    referenceId?: string
  ): Promise<number> {
    if (amountXof <= 0) return 0;

    const wallet = await this.getOrCreateWallet(userId);
    let amountToDebit = Math.min(amountXof, Number(wallet.balanceXof));
    if (amountToDebit <= 0) return 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const claim = await prisma.wallet.updateMany({
        where: { id: wallet.id, balanceXof: { gte: amountToDebit } },
        data: { balanceXof: { decrement: amountToDebit } },
      });

      if (claim.count > 0) {
        await prisma.walletTransaction.create({
          data: { walletId: wallet.id, amountXof: -amountToDebit, type, reason, referenceId },
        });
        return amountToDebit;
      }

      // Le solde a changé entre-temps (débit concurrent) - on relit la vraie valeur.
      const fresh = await prisma.wallet.findUnique({ where: { id: wallet.id } });
      amountToDebit = Math.min(amountXof, Number(fresh?.balanceXof ?? 0));
      if (amountToDebit <= 0) return 0;
    }

    return 0;
  }

  /**
   * Rembourse une commande directement vers le wallet plutôt que chez le
   * prestataire de paiement - solution de secours quand le remboursement
   * réel échoue ou n'est pas disponible pour ce prestataire (ex: Orange
   * Money, désactivé temporairement - voir OrangeMoneyAdapter.refundPayment).
   */
  async refundOrderToWallet(userId: string, orderId: string, amountXof: number, orderNumber: string) {
    await this.credit(
      userId,
      amountXof,
      WalletTransactionType.CREDIT_REFUND,
      `Remboursement commande ${orderNumber}`,
      orderId
    );
  }

  // ---------------- Dépôt (top-up) ----------------

  /** Initie un dépôt par mobile money/carte - crédité seulement après confirmation du paiement (voir confirmTopUp). */
  async initiateTopUp(userId: string, amountXof: number, provider: PaymentProvider, phone: string, name: string) {
    if (amountXof <= 0) throw new AppError('Le montant doit être positif', 422);

    const wallet = await this.getOrCreateWallet(userId);
    const adapter = getPaymentAdapter(provider);
    const result = await adapter.initiatePayment({
      orderId: `wallet-topup-${nanoid(8)}`,
      amountXof,
      customerPhone: phone,
      customerName: name,
      description: `Dépôt wallet Ridia Store`,
    });

    if (!result.providerTxnId) {
      throw new AppError("Échec de l'initiation du dépôt chez le prestataire", 502);
    }

    await prisma.walletTopUp.create({
      data: {
        walletId: wallet.id,
        amountXof,
        provider,
        providerTxnId: result.providerTxnId,
        status: 'PENDING',
        metadata: {
          payToken: (result.raw as { pay_token?: string } | undefined)?.pay_token ?? null,
          amountXof,
        },
      },
    });

    return { paymentUrl: result.paymentUrl, providerTxnId: result.providerTxnId };
  }

  /**
   * Confirme (ou non) un dépôt suite au webhook du prestataire. Idempotent :
   * un webhook redélivré pour un dépôt déjà traité ne recrédite jamais deux
   * fois (même bug corrigé cette session sur OrderService.confirmPayment).
   */
  async confirmTopUp(providerTxnId: string): Promise<boolean> {
    const topUp = await prisma.walletTopUp.findUnique({ where: { providerTxnId } });
    if (!topUp) return false; // pas un dépôt - laisse OrderService gérer (paiement de commande)
    if (topUp.status !== 'PENDING') return true; // déjà traité, webhook redélivré

    const adapter = getPaymentAdapter(topUp.provider);
    const result = await adapter.verifyPayment(providerTxnId, topUp.metadata);

    if (result.status === 'SUCCEEDED') {
      await prisma.$transaction([
        prisma.walletTopUp.update({ where: { id: topUp.id }, data: { status: 'SUCCEEDED', confirmedAt: new Date() } }),
        prisma.wallet.update({
          where: { id: topUp.walletId },
          data: { balanceXof: { increment: Number(topUp.amountXof) } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: topUp.walletId,
            amountXof: Number(topUp.amountXof),
            type: WalletTransactionType.CREDIT_TOPUP,
            reason: 'Dépôt wallet',
          },
        }),
      ]);
    } else if (result.status === 'FAILED') {
      await prisma.walletTopUp.update({ where: { id: topUp.id }, data: { status: 'FAILED' } });
    }
    // PENDING (erreur réseau transitoire côté prestataire) : ne rien faire,
    // laisse une prochaine redélivrance de webhook trancher plus tard.

    return true;
  }
}

export const walletService = new WalletService();
