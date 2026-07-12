import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { SellerStatus, PayoutStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class SellerService {
  async applyToBecomeSeller(userId: string, storeName: string, storeDescription?: string) {
    const existing = await prisma.seller.findUnique({ where: { userId } });
    if (existing) throw new AppError('Vous avez déjà un compte vendeur', 409);

    const storeSlug = `${slugify(storeName, { lower: true, strict: true })}-${nanoid(4)}`;

    const seller = await prisma.seller.create({
      data: { userId, storeName, storeSlug, storeDescription, status: SellerStatus.PENDING },
    });

    return seller;
  }

  async approveSeller(sellerId: string) {
    const seller = await prisma.seller.update({
      where: { id: sellerId },
      data: { status: SellerStatus.APPROVED, approvedAt: new Date() },
      select: { id: true, storeName: true, status: true, approvedAt: true, userId: true },
    });
    await prisma.user.update({ where: { id: seller.userId }, data: { role: UserRole.SELLER } });
    return seller;
  }

  async suspendSeller(sellerId: string, reason: string) {
    return prisma.seller.update({
      where: { id: sellerId },
      data: { status: SellerStatus.SUSPENDED, suspendedAt: new Date(), suspensionReason: reason },
      select: { id: true, storeName: true, status: true, suspendedAt: true, suspensionReason: true },
    });
  }

  /** Récupère le profil complet de la boutique pour édition */
  async getStoreProfile(sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        storeName: true,
        storeSlug: true,
        storeDescription: true,
        storeLogoUrl: true,
        storeBannerUrl: true,
      },
    });
    if (!seller) throw new AppError('Boutique non trouvée', 404);
    return seller;
  }

  /** Le vendeur personnalise sa vitrine (nom, description, logo, bannière) */
  async updateStoreProfile(
    sellerId: string,
    input: { storeName?: string; storeDescription?: string; storeLogoUrl?: string; storeBannerUrl?: string }
  ) {
    return prisma.seller.update({
      where: { id: sellerId },
      data: input,
      select: {
        id: true,
        storeName: true,
        storeSlug: true,
        storeDescription: true,
        storeLogoUrl: true,
        storeBannerUrl: true,
      },
    });
  }

  /**
   * Correction incohérence : `totalPayoutOwed` sommait TOUS les articles
   * vendus (y compris commandes non livrées, annulées, en litige) sans
   * jamais soustraire les versements déjà demandés/payés - le vendeur voyait
   * un montant "disponible à retirer" bien supérieur à ce qu'il pouvait
   * réellement demander (voir la validation ajoutée dans requestPayout),
   * menant à des demandes refusées de façon confuse. Même calcul que
   * requestPayout maintenant, pour que l'affichage corresponde à la réalité.
   */
  async getDashboardStats(sellerId: string) {
    const [seller, revenueAgg, totalPayoutOwed, pendingOrders, productCount] = await Promise.all([
      prisma.seller.findUnique({ where: { id: sellerId } }),
      prisma.orderItem.aggregate({
        where: { sellerId },
        _sum: { totalXof: true },
        _count: true,
      }),
      this.getAvailablePayoutAmount(sellerId),
      prisma.orderItem.count({ where: { sellerId, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } } }),
      prisma.product.count({ where: { sellerId } }),
    ]);

    if (!seller) throw new AppError('Vendeur non trouvé', 404);

    return {
      storeName: seller.storeName,
      rating: seller.rating,
      totalRevenue: revenueAgg._sum.totalXof || 0,
      totalPayoutOwed,
      totalOrders: revenueAgg._count,
      pendingOrders,
      productCount,
    };
  }

  /**
   * Correction faille : aucune vérification n'empêchait un vendeur de
   * demander un versement d'un montant arbitraire, sans rapport avec ce
   * qui lui est réellement dû - la validation reposait entièrement sur un
   * admin vérifiant manuellement avant d'approuver, ce qui n'existe même
   * pas encore côté API. Le montant disponible est maintenant calculé et
   * vérifié ici : somme des commandes réellement livrées, moins les
   * versements déjà en attente ou déjà payés (jamais compté deux fois).
   */
  /** Montant réellement disponible à demander en versement (voir getDashboardStats et requestPayout) */
  private async getAvailablePayoutAmount(sellerId: string): Promise<number> {
    const [earnedAgg, alreadyRequestedAgg] = await Promise.all([
      prisma.orderItem.aggregate({
        where: { sellerId, status: 'DELIVERED' },
        _sum: { sellerPayoutXof: true },
      }),
      prisma.payout.aggregate({
        where: { sellerId, status: { in: ['PENDING', 'PROCESSING', 'PAID'] } },
        _sum: { amountXof: true },
      }),
    ]);

    const totalEarned = Number(earnedAgg._sum.sellerPayoutXof || 0);
    const alreadyRequestedOrPaid = Number(alreadyRequestedAgg._sum.amountXof || 0);
    return Math.max(0, totalEarned - alreadyRequestedOrPaid);
  }

  async requestPayout(sellerId: string, amountXof: number, method: string, destinationRef: string) {
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new AppError('Vendeur non trouvé', 404);

    const availableToRequest = await this.getAvailablePayoutAmount(sellerId);

    if (amountXof > availableToRequest) {
      throw new AppError(
        `Montant demandé supérieur à ce qui est disponible (${availableToRequest} FCFA disponibles)`,
        422
      );
    }

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);

    return prisma.payout.create({
      data: {
        sellerId,
        amountXof,
        method,
        destinationRef,
        periodStart,
        periodEnd,
        status: PayoutStatus.PENDING,
      },
    });
  }

  async getSellerProducts(sellerId: string, page = 1, pageSize = 30) {
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          priceTiers: { orderBy: { minQuantity: 'asc' } },
        },
      }),
      prisma.product.count({ where: { sellerId } }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
}

export const sellerService = new SellerService();
