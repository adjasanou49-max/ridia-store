jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    loyaltyAccount: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    loyaltyTransaction: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    systemSetting: {
      findMany: jest.fn().mockResolvedValue([]), // aucun réglage admin -> valeurs par défaut
    },
  };
  mockPrisma.$transaction = jest.fn((arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma)
  );
  return { prisma: mockPrisma };
});

import { prisma } from '../config/prisma';
import { LoyaltyService } from './LoyaltyService';

const mockedPrisma = prisma as unknown as {
  loyaltyAccount: { upsert: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  loyaltyTransaction: { create: jest.Mock; findFirst: jest.Mock };
  $transaction: jest.Mock;
};

describe('LoyaltyService.redeemPoints - correction race condition', () => {
  const service = new LoyaltyService();
  const account = { id: 'acc-1', userId: 'user-1', pointsBalance: 100, lifetimePoints: 3000 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.loyaltyAccount.upsert.mockResolvedValue(account);
  });

  it('débite normalement quand le solde est suffisant', async () => {
    mockedPrisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });

    const used = await service.redeemPoints('user-1', 60);

    expect(used).toBe(60);
    expect(mockedPrisma.loyaltyAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc-1', pointsBalance: { gte: 60 } },
      data: { pointsBalance: { decrement: 60 } },
    });
    expect(mockedPrisma.loyaltyTransaction.create).toHaveBeenCalled();
  });

  it("ne débite jamais plus que ce qui est demandé même si le solde est plus grand", async () => {
    mockedPrisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });

    await service.redeemPoints('user-1', 30);

    expect(mockedPrisma.loyaltyAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pointsBalance: { decrement: 30 } } })
    );
  });

  it('retente avec le solde réel si une dépense concurrente a déjà débité entre-temps, sans jamais aller en négatif', async () => {
    // Première tentative (100 points) échoue : une requête concurrente a débité avant nous.
    mockedPrisma.loyaltyAccount.updateMany.mockResolvedValueOnce({ count: 0 });
    // Relecture : il ne reste en réalité que 20 points.
    mockedPrisma.loyaltyAccount.findUnique.mockResolvedValueOnce({ ...account, pointsBalance: 20 });
    // Deuxième tentative avec le solde à jour (20) réussit.
    mockedPrisma.loyaltyAccount.updateMany.mockResolvedValueOnce({ count: 1 });

    const used = await service.redeemPoints('user-1', 100);

    expect(used).toBe(20);
    expect(mockedPrisma.loyaltyAccount.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'acc-1', pointsBalance: { gte: 20 } },
      data: { pointsBalance: { decrement: 20 } },
    });
  });

  it('renvoie 0 sans écrire si le solde réel retombe à 0 après une contention', async () => {
    mockedPrisma.loyaltyAccount.updateMany.mockResolvedValueOnce({ count: 0 });
    mockedPrisma.loyaltyAccount.findUnique.mockResolvedValueOnce({ ...account, pointsBalance: 0 });

    const used = await service.redeemPoints('user-1', 100);

    expect(used).toBe(0);
    expect(mockedPrisma.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('renvoie 0 immédiatement pour une demande de 0 ou négative', async () => {
    expect(await service.redeemPoints('user-1', 0)).toBe(0);
    expect(await service.redeemPoints('user-1', -10)).toBe(0);
    expect(mockedPrisma.loyaltyAccount.updateMany).not.toHaveBeenCalled();
  });
});

describe('LoyaltyService.awardPointsForOrder - correction bug idempotence', () => {
  const service = new LoyaltyService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.loyaltyAccount.upsert.mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
      pointsBalance: 0,
      lifetimePoints: 0,
    });
  });

  it('attribue les points la première fois', async () => {
    mockedPrisma.loyaltyTransaction.findFirst.mockResolvedValue(null);

    await service.awardPointsForOrder('user-1', 'order-1', 10000);

    expect(mockedPrisma.loyaltyTransaction.findFirst).toHaveBeenCalledWith({
      where: { referenceId: 'order-1', reason: 'Commande livrée' },
    });
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it("n'attribue rien une deuxième fois pour la même commande (double webhook transporteur, double-clic admin)", async () => {
    mockedPrisma.loyaltyTransaction.findFirst.mockResolvedValue({ id: 'existing-tx' });

    await service.awardPointsForOrder('user-1', 'order-1', 10000);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.loyaltyAccount.upsert).not.toHaveBeenCalled();
  });

  it("utilise le taux de points configuré par l'admin plutôt que la valeur par défaut", async () => {
    mockedPrisma.loyaltyTransaction.findFirst.mockResolvedValue(null);
    // Admin a configuré 1 point tous les 100 FCFA (au lieu de 1000 par défaut)
    mockedPrisma.systemSetting.findMany.mockResolvedValueOnce([
      { key: 'loyaltyPointsPerXof', value: 1 / 100 },
    ]);

    await service.awardPointsForOrder('user-1', 'order-1', 10000);

    expect(mockedPrisma.loyaltyAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pointsBalance: { increment: 100 } }) })
    );
  });
});
