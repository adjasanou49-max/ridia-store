import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * Pas de fournisseur avec API - un agent humain place chaque commande
 * manuellement sur la plateforme d'origine (Pinduoduo/1688/etc). Ce service
 * expose donc :
 * 1. La liste des articles à commander, avec le lien produit source visible
 *    (product.sourceUrl) pour que l'agent puisse cliquer et commander lui-même.
 * 2. Une action pour marquer un article comme commandé une fois fait.
 */
export class SupplierFulfillmentService {
  async listPendingFulfillment() {
    return prisma.orderItem.findMany({
      where: {
        order: { status: { in: ['CONFIRMED', 'PROCESSING'] } },
        supplierForward: null,
      },
      select: {
        id: true,
        productName: true,
        quantity: true,
        product: { select: { sourceUrl: true, sourceProductId: true } },
        variant: { select: { name: true, attributes: true } },
        order: {
          select: {
            orderNumber: true,
            createdAt: true,
            shippingAddress: {
              select: {
                fullName: true,
                phone: true,
                country: true,
                city: true,
                streetLine1: true,
                streetLine2: true,
              },
            },
          },
        },
      },
      orderBy: { order: { createdAt: 'asc' } },
    });
  }

  async markAsOrdered(orderItemId: string, agentUserId: string, supplierOrderRef?: string) {
    const item = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item) throw new AppError('Article de commande non trouvé', 404);

    const existing = await prisma.supplierOrderForward.findUnique({ where: { orderItemId } });
    if (existing) throw new AppError('Cet article est déjà marqué comme commandé', 422);

    return prisma.supplierOrderForward.create({
      data: {
        orderItemId,
        markedByUserId: agentUserId,
        status: 'SENT',
        supplierOrderRef,
        sentAt: new Date(),
      },
    });
  }
}

export const supplierFulfillmentService = new SupplierFulfillmentService();
