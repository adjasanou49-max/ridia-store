import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

interface ImportedReviewInput {
  authorName: string;
  rating: number;
  comment?: string;
  imageUrls?: string[];
}

export class ReviewService {
  async listForProduct(productId: string) {
    const reviews = await prisma.review.findMany({
      where: { productId, status: 'APPROVED' },
      // Priorité aux avis positifs (3-5★) en tête de liste ; les avis négatifs (1-2★)
      // restent visibles - jamais masqués, par honnêteté envers le client - mais
      // apparaissent en dernier plutôt qu'en premier.
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: { user: { select: { firstName: true, avatarUrl: true } } },
    });

    // Masque le prénom (et l'avatar) si le client a choisi de publier anonymement -
    // fait ici plutôt qu'en base pour garder la vraie donnée en cas de litige/modération.
    return reviews.map((r) => (r.isAnonymous ? { ...r, user: { firstName: 'Client', avatarUrl: null } } : r));
  }

  /** Avis laissé par un vrai client Ridia sur une commande livrée */
  async createOrganicReview(
    userId: string,
    orderItemId: string,
    input: { rating: number; comment?: string; imageUrls?: string[]; isAnonymous?: boolean }
  ) {
    const orderItem = await prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { userId } },
    });
    if (!orderItem) throw new AppError('Article de commande non trouvé', 404);
    if (orderItem.status !== 'DELIVERED') {
      throw new AppError('Tu ne peux laisser un avis que sur un article livré', 422);
    }

    const existing = await prisma.review.findUnique({ where: { orderItemId } });
    if (existing) throw new AppError('Tu as déjà laissé un avis pour cet article', 409);

    const review = await prisma.review.create({
      data: {
        productId: orderItem.productId,
        userId,
        orderItemId,
        source: 'ORGANIC',
        status: 'APPROVED',
        rating: input.rating,
        comment: input.comment,
        imageUrls: input.imageUrls || [],
        isAnonymous: input.isAnonymous ?? false,
      },
    });

    await this.recomputeProductRating(orderItem.productId);
    return review;
  }

  /** Avis importés en masse depuis le fournisseur (1688/Taobao/Pinduoduo) au moment de l'import produit */
  async bulkImportReviews(productId: string, reviews: ImportedReviewInput[]) {
    if (reviews.length === 0) return;

    await prisma.review.createMany({
      data: reviews.map((r) => ({
        productId,
        source: 'IMPORTED' as const,
        status: 'APPROVED' as const,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        imageUrls: r.imageUrls || [],
      })),
    });

    await this.recomputeProductRating(productId);
  }

  /** Recalcule la note moyenne + le nombre d'avis d'un produit (dénormalisé pour perf) */
  async recomputeProductRating(productId: string) {
    const agg = await prisma.review.aggregate({
      where: { productId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        rating: agg._avg.rating ?? 0,
        reviewCount: agg._count,
      },
    });
  }
}

export const reviewService = new ReviewService();
