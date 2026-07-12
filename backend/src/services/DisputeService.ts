import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';
import { logger } from '../config/logger';

export class DisputeService {
  async createDispute(
    userId: string,
    orderId: string,
    input: { reason: string; description: string; imageUrls?: string[] }
  ) {
    const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new AppError('Commande non trouvée', 404);

    const existing = await prisma.dispute.findUnique({ where: { orderId } });
    if (existing) throw new AppError('Un litige existe déjà pour cette commande', 409);

    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        userId,
        reason: input.reason,
        description: input.description,
        imageUrls: input.imageUrls || [],
      },
    });

    await prisma.order.update({ where: { id: orderId }, data: { status: 'DISPUTED' } });

    return dispute;
  }

  async getUserDisputes(userId: string) {
    return prisma.dispute.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true, totalXof: true } } },
    });
  }

  async getAllDisputes(status?: string) {
    return prisma.dispute.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderNumber: true, totalXof: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  /**
   * Correction race condition (la plus critique financièrement de cette
   * revue) : la résolution n'était jamais conditionnée à l'état actuel du
   * litige - deux résolutions concurrentes (double-clic admin, ou deux
   * admins sur le même litige) pouvaient toutes les deux lire le paiement
   * comme "SUCCEEDED" et déclencher CHACUNE un vrai remboursement chez le
   * prestataire de paiement, remboursant le client deux fois. La mise à
   * jour du litige est maintenant conditionnée : seule la résolution dont
   * l'écriture atomique réussit (litige pas déjà dans un état terminal)
   * déclenche le remboursement.
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    resolution: string,
    outcome: 'RESOLVED_REFUNDED' | 'RESOLVED_REJECTED'
  ) {
    const claim = await prisma.dispute.updateMany({
      where: { id: disputeId, status: { notIn: ['RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'CLOSED'] } },
      data: { status: outcome, resolution, resolvedBy: adminId, resolvedAt: new Date() },
    });

    if (claim.count === 0) {
      throw new AppError('Ce litige a déjà été résolu', 409);
    }

    const dispute = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });

    // Remboursement réellement déclenché chez le prestataire de paiement - pas juste
    // un changement de statut interne. Si ça échoue, le litige reste marqué remboursé
    // (décision admin déjà prise) mais l'erreur est journalisée pour suivi manuel.
    if (outcome === 'RESOLVED_REFUNDED') {
      await this.triggerRefund(dispute.orderId);
    }

    return dispute;
  }

  private async triggerRefund(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'SUCCEEDED' }, orderBy: { paidAt: 'desc' }, take: 1 } },
    });
    const payment = order?.payments[0];
    if (!order || !payment) {
      logger.error('Remboursement impossible - aucun paiement confirmé trouvé', { orderId });
      return;
    }
    if (!payment.providerTxnId) {
      logger.error('Remboursement impossible - aucune référence de transaction chez le prestataire', { orderId });
      return;
    }

    try {
      const adapter = getPaymentAdapter(payment.provider);
      const result = await adapter.refundPayment(payment.providerTxnId, Number(order.totalXof));
      if (result.success) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
        await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
      } else {
        logger.error('Le remboursement a échoué côté prestataire', { orderId, provider: payment.provider });
      }
    } catch (err: any) {
      logger.error('Erreur lors du remboursement', { orderId, error: err.message });
    }
  }
}

export const disputeService = new DisputeService();
