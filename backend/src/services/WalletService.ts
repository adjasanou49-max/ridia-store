import { WalletTransactionType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

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

  /**
   * Crédite le wallet (remboursement redirigé, geste commercial). Toujours
   * autorisé - créditer ne peut jamais faire passer un solde sous zéro.
   */
  async credit(
    userId: string,
    amountXof: number,
    type: Extract<WalletTransactionType, 'CREDIT_REFUND' | 'CREDIT_ADMIN'>,
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
   * Débite le wallet (paiement d'une commande, correction admin).
   *
   * Suit le même schéma anti-race-condition que LoyaltyService.redeemPoints
   * (déjà audité et corrigé cette session) : le débit est conditionné
   * directement dans l'écriture (balanceXof >= montant demandé), jamais un
   * simple lire-puis-écrire qui pourrait laisser passer un solde négatif en
   * cas de débits concurrents (ex: deux onglets, retry réseau).
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
}

export const walletService = new WalletService();
