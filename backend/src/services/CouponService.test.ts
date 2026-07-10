jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    coupon: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    couponUsage: {
      create: jest.fn(),
      count: jest.fn(),
    },
  };
  mockPrisma.$transaction = jest.fn(async (callback: (tx: any) => any) => callback(mockPrisma));
  return { prisma: mockPrisma };
});

import { prisma } from '../config/prisma';
import { CouponService } from './CouponService';

const mockedPrisma = prisma as unknown as {
  coupon: { findUnique: jest.Mock; updateMany: jest.Mock };
  couponUsage: { create: jest.Mock; count: jest.Mock };
};

describe('CouponService.recordUsage - correction race condition', () => {
  const service = new CouponService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("enregistre l'utilisation quand la limite n'est pas atteinte", async () => {
    mockedPrisma.coupon.findUnique.mockResolvedValue({ id: 'c1', maxUses: 100, usedCount: 5 });
    mockedPrisma.coupon.updateMany.mockResolvedValue({ count: 1 });

    await service.recordUsage('c1', 'user-1', 'order-1');

    expect(mockedPrisma.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', usedCount: { lt: 100 } },
      data: { usedCount: { increment: 1 } },
    });
    expect(mockedPrisma.couponUsage.create).toHaveBeenCalledWith({
      data: { couponId: 'c1', userId: 'user-1', orderId: 'order-1' },
    });
  });

  it('refuse si la limite globale vient d\'être atteinte par une commande concurrente', async () => {
    mockedPrisma.coupon.findUnique.mockResolvedValue({ id: 'c1', maxUses: 100, usedCount: 99 });
    // Simule une commande concurrente ayant déjà porté usedCount à 100 entre-temps.
    mockedPrisma.coupon.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.recordUsage('c1', 'user-1', 'order-1')).rejects.toThrow(
      "Ce code promo a atteint sa limite d'utilisation"
    );
    expect(mockedPrisma.couponUsage.create).not.toHaveBeenCalled();
  });

  it('ne conditionne pas sur usedCount si le coupon n\'a pas de limite (maxUses null)', async () => {
    mockedPrisma.coupon.findUnique.mockResolvedValue({ id: 'c1', maxUses: null, usedCount: 500 });
    mockedPrisma.coupon.updateMany.mockResolvedValue({ count: 1 });

    await service.recordUsage('c1', 'user-1', 'order-1');

    expect(mockedPrisma.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { usedCount: { increment: 1 } },
    });
  });

  it('rejette si le coupon est introuvable', async () => {
    mockedPrisma.coupon.findUnique.mockResolvedValue(null);

    await expect(service.recordUsage('c1', 'user-1', 'order-1')).rejects.toThrow(
      'Code promo introuvable'
    );
    expect(mockedPrisma.coupon.updateMany).not.toHaveBeenCalled();
  });
});
