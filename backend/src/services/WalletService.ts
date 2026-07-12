import { WalletTransactionType, PaymentProvider, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';

// Types de crédit considérés comme "argent réel" du client, donc retirables :
// ses propres dépôts et les remboursements. Les crédits admin (bonus, gestes
// commerciaux) ne le sont jamais - dépensables uniquement.
const WITHDRAWABLE_CREDIT_TYPES: WalletTransactionType[] = ['CREDIT_TOPUP', 'CREDIT_REFUND'];

export class WalletService {
  async getOrCreateWallet(userId: string) {
    return prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getBalance(userId: string): Promise<{ balanceXof: number; withdrawableBalanceXof: number }> {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      balanceXof: Number(wallet.balanceXof),
      withdrawableBalanceXof: Number(wallet.withdrawableBalanceXof),
    };
  }

  async getHistory(userId: string, take = 30) {
    const wallet = await this.getOrCreateWallet(userId);
    return prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Crédite le wallet. Le solde retirable n'augmente que pour les dépôts et
   * remboursements (CREDIT_TOPUP / CREDIT_REFUND) - jamais pour un crédit
   * admin (bonus), qui reste dépensable uniquement.
   */
  async credit(
    userId: string,
    amountXof: number,
    type: Extract<WalletTransactionType, 'CREDIT_TOPUP' | 'CREDIT_REFUND' | 'CREDIT_ADMIN'>,
    reason: string,
    referenceId?: string
  ) {
    if (amountXof <= 0) throw new AppError('Le montant à créditer doit être positif', 422);

    const wallet = await this.getOrCreateWallet(userId);
    const isWithdrawable = WITHDRAWABLE_CREDIT_TYPES.includes(type);

    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceXof: { increment: amountXof },
          ...(isWithdrawable && { withdrawableBalanceXof: { increment: amountXof } }),
        },
      }),
      prisma.walletTransaction.create({
        data: { walletId: wallet.id, amountXof, type, reason, referenceId },
      }),
    ]);
  }

  /**
   * Débite le wallet pour une dépense (paiement de commande, correction
   * admin). Consomme en priorité la part NON retirable (bonus) du solde,
   * pour préserver le plus longtemps possible l'argent réel du client
   * (dépôts + remboursements) - voir le commentaire sur le modèle Wallet.
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

    let wallet = await this.getOrCreateWallet(userId);
    let amountToDebit = Math.min(amountXof, Number(wallet.balanceXof));
    if (amountToDebit <= 0) return 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const nonWithdrawable = Number(wallet.balanceXof) - Number(wallet.withdrawableBalanceXof);
      const consumeFromWithdrawable = Math.max(0, amountToDebit - nonWithdrawable);

      const claim = await prisma.wallet.updateMany({
        where: { id: wallet.id, balanceXof: { gte: amountToDebit } },
        data: {
          balanceXof: { decrement: amountToDebit },
          withdrawableBalanceXof: { decrement: consumeFromWithdrawable },
        },
      });

      if (claim.count > 0) {
        await prisma.walletTransaction.create({
          data: { walletId: wallet.id, amountXof: -amountToDebit, type, reason, referenceId },
        });
        return amountToDebit;
      }

      // Le solde a changé entre-temps (débit concurrent) - on relit la vraie valeur.
      const fresh = await prisma.wallet.findUnique({ where: { id: wallet.id } });
      if (!fresh) return 0;
      wallet = fresh;
      amountToDebit = Math.min(amountXof, Number(fresh.balanceXof));
      if (amountToDebit <= 0) return 0;
    }

    return 0;
  }

  /**
   * Rembourse une commande directement vers le wallet plutôt que chez le
   * prestataire de paiement - solution de secours quand le remboursement
   * réel échoue ou n'est pas disponible pour ce prestataire (ex: Orange
   * Money, désactivé temporairement - voir OrangeMoneyAdapter.refundPayment).
   * Toujours retirable : c'est bien l'argent réel du client.
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
    const result = await adapter.verifyPayment(providerTxnId);

    if (result.status === 'SUCCEEDED') {
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: topUp.walletId } });
      await prisma.$transaction([
        prisma.walletTopUp.update({ where: { id: topUp.id }, data: { status: 'SUCCEEDED', confirmedAt: new Date() } }),
        prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balanceXof: { increment: Number(topUp.amountXof) },
            withdrawableBalanceXof: { increment: Number(topUp.amountXof) },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
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

  // ---------------- Retrait ----------------

  /**
   * Demande de retrait. Le montant doit venir uniquement du solde retirable
   * (jamais des bonus admin) - débit atomique conditionné sur ce solde
   * précis, distinct du débit générique utilisé pour les achats (qui
   * consomme le bonus en premier).
   *
   * Le versement réel reste manuel (voir commentaire sur le modèle
   * WalletWithdrawalRequest) : cette méthode bloque le montant côté wallet
   * immédiatement (empêche toute double dépense) et crée une demande que
   * l'équipe traite ensuite depuis l'admin.
   */
  async requestWithdrawal(userId: string, amountXof: number, phoneNumber: string) {
    if (amountXof <= 0) throw new AppError('Le montant doit être positif', 422);

    const wallet = await this.getOrCreateWallet(userId);

    const request = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claim = await tx.wallet.updateMany({
        where: { id: wallet.id, withdrawableBalanceXof: { gte: amountXof } },
        data: {
          balanceXof: { decrement: amountXof },
          withdrawableBalanceXof: { decrement: amountXof },
        },
      });

      if (claim.count === 0) {
        throw new AppError('Solde retirable insuffisant pour ce montant', 422);
      }

      const withdrawalRequest = await tx.walletWithdrawalRequest.create({
        data: { walletId: wallet.id, amountXof, phoneNumber, status: 'PENDING' },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amountXof: -amountXof,
          type: WalletTransactionType.DEBIT_WITHDRAWAL,
          reason: `Demande de retrait vers ${phoneNumber}`,
          referenceId: withdrawalRequest.id,
        },
      });

      return withdrawalRequest;
    });

    return request;
  }

  /** Liste les demandes de retrait en attente (vue admin) */
  async getPendingWithdrawals() {
    return prisma.walletWithdrawalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { wallet: { include: { user: { select: { firstName: true, lastName: true, phone: true, email: true } } } } },
    });
  }

  /**
   * Marque une demande de retrait comme traitée (argent réellement envoyé
   * manuellement par l'équipe) ou refusée (recrédite le wallet).
   */
  async resolveWithdrawal(requestId: string, adminId: string, approve: boolean, note?: string) {
    const request = await prisma.walletWithdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError('Demande de retrait introuvable', 404);
    if (request.status !== 'PENDING') throw new AppError('Cette demande a déjà été traitée', 409);

    if (approve) {
      await prisma.walletWithdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED', processedBy: adminId, processedAt: new Date(), adminNote: note },
      });
    } else {
      // Refusée : on recrédite le wallet (retirable, puisque prélevé du retirable à la demande).
      await prisma.$transaction([
        prisma.walletWithdrawalRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED', processedBy: adminId, processedAt: new Date(), adminNote: note },
        }),
        prisma.wallet.update({
          where: { id: request.walletId },
          data: {
            balanceXof: { increment: Number(request.amountXof) },
            withdrawableBalanceXof: { increment: Number(request.amountXof) },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: request.walletId,
            amountXof: Number(request.amountXof),
            type: WalletTransactionType.CREDIT_ADMIN,
            reason: 'Retrait refusé - solde recrédité',
            referenceId: requestId,
          },
        }),
      ]);
    }
  }
}

export const walletService = new WalletService();
