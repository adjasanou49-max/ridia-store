jest.mock('../config/prisma', () => ({
  prisma: {
    seller: { findUnique: jest.fn() },
    orderItem: { aggregate: jest.fn(), count: jest.fn() },
    payout: { aggregate: jest.fn(), create: jest.fn() },
    product: { count: jest.fn() },
  },
}));

import { prisma } from '../config/prisma';
import { SellerService } from './SellerService';

const mockedPrisma = prisma as unknown as {
  seller: { findUnique: jest.Mock };
  orderItem: { aggregate: jest.Mock; count: jest.Mock };
  payout: { aggregate: jest.Mock; create: jest.Mock };
  product: { count: jest.Mock };
};

describe('SellerService.requestPayout - correction faille de validation de montant', () => {
  const service = new SellerService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.seller.findUnique.mockResolvedValue({ id: 's1' });
  });

  it('accepte une demande dans la limite du montant réellement dû', async () => {
    mockedPrisma.orderItem.aggregate.mockResolvedValue({ _sum: { sellerPayoutXof: 100000 } });
    mockedPrisma.payout.aggregate.mockResolvedValue({ _sum: { amountXof: 0 } });
    mockedPrisma.payout.create.mockResolvedValue({ id: 'payout-1' });

    await service.requestPayout('s1', 50000, 'WAVE', '+22670000000');

    expect(mockedPrisma.payout.create).toHaveBeenCalled();
  });

  it("rejette une demande supérieure à ce qui est réellement dû (faille corrigée)", async () => {
    mockedPrisma.orderItem.aggregate.mockResolvedValue({ _sum: { sellerPayoutXof: 50000 } });
    mockedPrisma.payout.aggregate.mockResolvedValue({ _sum: { amountXof: 0 } });

    await expect(service.requestPayout('s1', 500000, 'WAVE', '+22670000000')).rejects.toThrow(
      'Montant demandé supérieur à ce qui est disponible'
    );
    expect(mockedPrisma.payout.create).not.toHaveBeenCalled();
  });

  it('ne compte que les commandes réellement livrées (pas juste confirmées/en cours)', async () => {
    // aggregate est déjà filtré par status: 'DELIVERED' dans le code - on
    // vérifie juste que le filtre est bien passé à Prisma.
    mockedPrisma.orderItem.aggregate.mockResolvedValue({ _sum: { sellerPayoutXof: 20000 } });
    mockedPrisma.payout.aggregate.mockResolvedValue({ _sum: { amountXof: 0 } });
    mockedPrisma.payout.create.mockResolvedValue({ id: 'payout-1' });

    await service.requestPayout('s1', 20000, 'WAVE', '+22670000000');

    expect(mockedPrisma.orderItem.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: 's1', status: 'DELIVERED' } })
    );
  });

  it('déduit les versements déjà en attente ou payés du montant disponible (empêche le double comptage)', async () => {
    mockedPrisma.orderItem.aggregate.mockResolvedValue({ _sum: { sellerPayoutXof: 100000 } });
    // 80 000 déjà demandés/payés -> il ne reste que 20 000 disponibles
    mockedPrisma.payout.aggregate.mockResolvedValue({ _sum: { amountXof: 80000 } });

    await expect(service.requestPayout('s1', 30000, 'WAVE', '+22670000000')).rejects.toThrow(
      'Montant demandé supérieur à ce qui est disponible'
    );
  });

  it('rejette si le vendeur est introuvable', async () => {
    mockedPrisma.seller.findUnique.mockResolvedValue(null);

    await expect(service.requestPayout('inconnu', 1000, 'WAVE', '+22670000000')).rejects.toThrow(
      'Vendeur non trouvé'
    );
  });
});

describe('SellerService.getDashboardStats - cohérence avec requestPayout', () => {
  const service = new SellerService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.seller.findUnique.mockResolvedValue({ id: 's1', storeName: 'Ma boutique', rating: 4.5 });
  });

  it("affiche le même montant disponible que celui accepté par requestPayout (avant : totalPayoutOwed comptait tout, non-livré/annulé inclus)", async () => {
    mockedPrisma.orderItem.aggregate
      .mockResolvedValueOnce({ _sum: { totalXof: 500000 }, _count: 42 }) // revenu total (toutes commandes)
      .mockResolvedValueOnce({ _sum: { sellerPayoutXof: 100000 } }); // gagné (livré uniquement)
    mockedPrisma.payout.aggregate.mockResolvedValue({ _sum: { amountXof: 30000 } }); // déjà demandé
    mockedPrisma.orderItem.count.mockResolvedValue(3);
    mockedPrisma.product.count.mockResolvedValue(10);

    const stats = await service.getDashboardStats('s1');

    // 100 000 gagnés - 30 000 déjà demandés = 70 000 réellement disponibles
    // (et non 500 000, le revenu brut total toutes commandes confondues)
    expect(stats.totalPayoutOwed).toBe(70000);
    expect(stats.totalRevenue).toBe(500000);
  });
});
