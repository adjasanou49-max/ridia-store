import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class CouponService {
  async listAll() {
    return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(input: {
    code: string;
    type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value: number;
    minOrderXof?: number;
    maxUses?: number;
    maxUsesPerUser?: number;
    expiresAt?: Date;
  }) {
    return prisma.coupon.create({
      data: {
        code: input.code.toUpperCase(),
        type: input.type,
        value: input.value,
        minOrderXof: input.minOrderXof,
        maxUses: input.maxUses,
        maxUsesPerUser: input.maxUsesPerUser ?? 1,
        expiresAt: input.expiresAt,
      },
    });
  }

  async toggleActive(id: string, isActive: boolean) {
    return prisma.coupon.update({ where: { id }, data: { isActive } });
  }

  /** Valide un code promo pour un utilisateur et un sous-total donnés, renvoie la remise */
  async validate(code: string, userId: string, subtotalXof: number): Promise<{ coupon: any; discountXof: number }> {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new AppError('Code promo invalide', 422);
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new AppError('Ce code promo a expiré', 422);
    }
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      throw new AppError('Ce code promo a atteint sa limite d\'utilisation', 422);
    }
    if (coupon.minOrderXof && subtotalXof < Number(coupon.minOrderXof)) {
      throw new AppError(`Commande minimum de ${coupon.minOrderXof} FCFA requise pour ce code`, 422);
    }

    const userUsageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (userUsageCount >= coupon.maxUsesPerUser) {
      throw new AppError('Tu as déjà utilisé ce code promo', 422);
    }

    const discountXof =
      coupon.type === 'PERCENTAGE' ? Math.round((subtotalXof * coupon.value) / 100) : Number(coupon.value);

    return { coupon, discountXof: Math.min(discountXof, subtotalXof) };
  }

  /** Enregistre l'utilisation du coupon après création de la commande */
  async recordUsage(couponId: string, userId: string, orderId: string) {
    await prisma.$transaction([
      prisma.couponUsage.create({ data: { couponId, userId, orderId } }),
      prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } }),
    ]);
  }
}

export const couponService = new CouponService();
