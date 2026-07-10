import { prisma } from '../config/prisma';

export class WishlistService {
  async getWishlist(userId: string) {
    return prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            basePriceXof: true,
            stockQuantity: true,
            rating: true,
            reviewCount: true,
            salesCount: true,
            images: { where: { isPrimary: true }, take: 1 },
            priceTiers: { orderBy: { minQuantity: 'desc' }, take: 1 },
            seller: { select: { storeName: true, storeSlug: true } },
          },
        },
      },
    });
  }

  /** Ajoute/retire un produit de la wishlist et renvoie le nouvel état (true = ajouté) */
  async toggle(userId: string, productId: string): Promise<boolean> {
    const existing = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      return false;
    }

    await prisma.wishlistItem.create({ data: { userId, productId } });
    return true;
  }

  async getWishlistedProductIds(userId: string): Promise<string[]> {
    const items = await prisma.wishlistItem.findMany({ where: { userId }, select: { productId: true } });
    return items.map((i) => i.productId);
  }
}

export const wishlistService = new WishlistService();
