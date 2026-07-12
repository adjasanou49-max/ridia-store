jest.mock('nanoid', () => ({ nanoid: () => 'ABC123' }));

jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    product: { findUnique: jest.fn(), update: jest.fn() },
    cartItem: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    order: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    orderItem: { updateMany: jest.fn() },
    payment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  mockPrisma.$transaction = jest.fn((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)
  );
  mockPrisma.$executeRaw = jest.fn();
  return { prisma: mockPrisma };
});
jest.mock('../config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../integrations/payments/PaymentProviderRegistry', () => ({
  getPaymentAdapter: jest.fn(),
}));
jest.mock('../queues/notificationQueue', () => ({
  notificationQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('./ProductService', () => ({
  productService: { getUnitPriceForQuantity: jest.fn(() => 1000) },
}));
jest.mock('./LoyaltyService', () => ({
  loyaltyService: { getOrCreateAccount: jest.fn(), redeemPoints: jest.fn() },
}));
jest.mock('./ReferralService', () => ({ referralService: {} }));
jest.mock('./WalletService', () => ({
  walletService: {
    getBalance: jest.fn().mockResolvedValue(0),
    debit: jest.fn().mockResolvedValue(0),
    refundOrderToWallet: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('./CouponService', () => ({
  couponService: { validate: jest.fn(), recordUsage: jest.fn() },
}));

import { prisma } from '../config/prisma';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';
import { couponService } from './CouponService';
import { OrderService } from './OrderService';

const mockedPrisma = prisma as any;
const mockedGetAdapter = getPaymentAdapter as jest.Mock;
const mockedCoupon = couponService as unknown as { validate: jest.Mock; recordUsage: jest.Mock };

describe('OrderService', () => {
  const service = new OrderService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addToCart - correction race condition + désynchronisation de quantité', () => {
    it('réserve avec succès quand le stock est disponible (nouvel article)', async () => {
      mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', stockQuantity: 10, reservedStock: 2 });
      mockedPrisma.cartItem.findUnique.mockResolvedValue(null);
      mockedPrisma.$executeRaw.mockResolvedValue(1); // 1 ligne affectée = réservation réussie
      mockedPrisma.cartItem.upsert.mockResolvedValue({ id: 'ci1', quantity: 3 });

      const result = await service.addToCart('u1', 'p1', 3);

      expect(result).toEqual({ id: 'ci1', quantity: 3 });
      expect(mockedPrisma.cartItem.upsert).toHaveBeenCalled();
    });

    it("refuse et ne crée pas d'article panier si le stock devient insuffisant au moment de la réservation (race condition)", async () => {
      mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', stockQuantity: 10, reservedStock: 2 });
      mockedPrisma.cartItem.findUnique.mockResolvedValue(null);
      // Simule une réservation concurrente ayant épuisé le stock entre-temps :
      // l'UPDATE conditionné n'affecte aucune ligne.
      mockedPrisma.$executeRaw.mockResolvedValue(0);

      await expect(service.addToCart('u1', 'p1', 5)).rejects.toThrow('Stock insuffisant');
      expect(mockedPrisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it("rejette si le produit n'existe pas", async () => {
      mockedPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.addToCart('u1', 'inexistant', 1)).rejects.toThrow('Produit non trouvé');
    });

    it("ne réserve que le delta (pas la quantité totale) quand l'article est déjà dans le panier", async () => {
      mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', stockQuantity: 10, reservedStock: 5 });
      mockedPrisma.cartItem.findUnique.mockResolvedValue({ id: 'ci1', quantity: 2 }); // déjà 2 réservés
      mockedPrisma.$executeRaw.mockResolvedValue(1);
      mockedPrisma.cartItem.upsert.mockResolvedValue({ id: 'ci1', quantity: 5 });

      await service.addToCart('u1', 'p1', 5); // 2 -> 5 : delta = 3, pas 5

      const rawCall = mockedPrisma.$executeRaw.mock.calls[0];
      // Le template tag reçoit (strings, productId, delta) ou (strings, delta, productId, delta)
      // selon l'ordre des interpolations ; on vérifie juste que 3 (le delta) apparaît, pas 5.
      expect(rawCall).toContain(3);
      expect(rawCall).not.toContain(5);
    });

    it('libère du stock (sans jamais échouer) quand la quantité diminue', async () => {
      mockedPrisma.product.findUnique.mockResolvedValue({ id: 'p1', stockQuantity: 10, reservedStock: 5 });
      mockedPrisma.cartItem.findUnique.mockResolvedValue({ id: 'ci1', quantity: 4 });
      mockedPrisma.cartItem.upsert.mockResolvedValue({ id: 'ci1', quantity: 1 });

      await service.addToCart('u1', 'p1', 1); // 4 -> 1 : libère 3

      expect(mockedPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { reservedStock: { decrement: 3 } },
      });
      expect(mockedPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('createOrderFromCart', () => {
    it('rejette si le panier est vide', async () => {
      mockedPrisma.cartItem.findMany.mockResolvedValue([]);

      await expect(
        service.createOrderFromCart('u1', 'addr1', 'ORANGE_MONEY' as any, '+22670000000', 'Ria')
      ).rejects.toThrow('Le panier est vide');
    });

    it('applique correctement un code promo valide au total', async () => {
      mockedPrisma.cartItem.findMany.mockResolvedValue([
        {
          productId: 'p1',
          variantId: null,
          quantity: 2,
          variant: null,
          product: {
            id: 'p1',
            name: 'Produit test',
            sellerId: 's1',
            seller: { commissionRate: 10 },
          },
        },
      ]);
      mockedCoupon.validate.mockResolvedValue({ discountXof: 500, coupon: { id: 'coupon1' } });
      mockedPrisma.order.create.mockResolvedValue({ id: 'order1', items: [] });
      mockedGetAdapter.mockReturnValue({
        initiatePayment: jest.fn().mockResolvedValue({
          success: true,
          providerTxnId: 'txn1',
          paymentUrl: 'https://pay.test',
        }),
      });

      const result = await service.createOrderFromCart(
        'u1',
        'addr1',
        'ORANGE_MONEY' as any,
        '+22670000000',
        'Ria',
        'PROMO10'
      );

      expect(mockedCoupon.validate).toHaveBeenCalledWith('PROMO10', 'u1', 2000); // 1000 x 2
      expect(mockedCoupon.recordUsage).toHaveBeenCalledWith('coupon1', 'u1', 'order1');
      expect(result.order.id).toBe('order1');
    });
  });

  describe('confirmPayment', () => {
    it('rejette si le paiement est introuvable', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.confirmPayment('txn-inconnu')).rejects.toThrow('Paiement introuvable');
    });

    it("ne retraite pas un paiement déjà confirmé (idempotence sur webhook redélivré)", async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay1',
        provider: 'ORANGE_MONEY',
        status: 'SUCCEEDED', // déjà traité par un appel précédent
        orderId: 'order1',
        order: { userId: 'u1', orderNumber: 'RID-2026-ABC123', totalXof: 2500, user: {}, items: [] },
      });

      await service.confirmPayment('txn1');

      expect(mockedGetAdapter).not.toHaveBeenCalled();
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('met à jour la commande et le paiement en cas de succès du prestataire', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay1',
        provider: 'ORANGE_MONEY',
        orderId: 'order1',
        order: { userId: 'u1', orderNumber: 'RID-2026-ABC123', totalXof: 2500, user: {}, items: [] },
      });
      mockedGetAdapter.mockReturnValue({
        verifyPayment: jest.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
      });

      await service.confirmPayment('txn1');

      expect(mockedPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('cancelOrder - correction bug critique (remboursement manquant)', () => {
    it("déclenche un vrai remboursement quand on annule une commande déjà payée (CONFIRMED)", async () => {
      mockedPrisma.order.findFirst.mockResolvedValue({
        id: 'order1',
        userId: 'u1',
        status: 'CONFIRMED',
        totalXof: 5000,
        items: [{ productId: 'p1', quantity: 2 }],
        payments: [{ id: 'pay1', providerTxnId: 'txn1', provider: 'WAVE', status: 'SUCCEEDED' }],
      });
      mockedGetAdapter.mockReturnValue({
        refundPayment: jest.fn().mockResolvedValue({ success: true }),
      });

      await service.cancelOrder('order1', 'u1');

      expect(mockedGetAdapter).toHaveBeenCalledWith('WAVE');
      expect(mockedPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: 'REFUNDED' },
      });
      // Le stock doit aussi être remis en vente
      expect(mockedPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stockQuantity: { increment: 2 }, salesCount: { decrement: 2 } },
      });
    });

    it("ne tente aucun remboursement pour une commande jamais payée (PENDING)", async () => {
      mockedPrisma.order.findFirst.mockResolvedValue({
        id: 'order2',
        userId: 'u1',
        status: 'PENDING',
        totalXof: 3000,
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [], // aucun paiement réussi
      });

      await service.cancelOrder('order2', 'u1');

      expect(mockedGetAdapter).not.toHaveBeenCalled();
      expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
    });

    it('rejette si la commande est déjà expédiée ou livrée', async () => {
      mockedPrisma.order.findFirst.mockResolvedValue({
        id: 'order3',
        userId: 'u1',
        status: 'SHIPPED',
        items: [],
        payments: [],
      });

      await expect(service.cancelOrder('order3', 'u1')).rejects.toThrow(
        'Cette commande ne peut plus être annulée'
      );
    });

    it("annule quand même la commande si le remboursement échoue côté prestataire (ne bloque pas l'annulation)", async () => {
      mockedPrisma.order.findFirst.mockResolvedValue({
        id: 'order4',
        userId: 'u1',
        status: 'PROCESSING',
        totalXof: 1000,
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [{ id: 'pay4', providerTxnId: 'txn4', provider: 'ORANGE_MONEY', status: 'SUCCEEDED' }],
      });
      mockedGetAdapter.mockReturnValue({
        refundPayment: jest.fn().mockRejectedValue(new Error('Provider indisponible')),
      });

      await expect(service.cancelOrder('order4', 'u1')).resolves.toBeUndefined();
      expect(mockedPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order4' } })
      );
    });
  });
});
