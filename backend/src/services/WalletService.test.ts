jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    wallet: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    walletTransaction: { create: jest.fn(), findMany: jest.fn() },
    walletTopUp: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  mockPrisma.$transaction = jest.fn((arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma)
  );
  return { prisma: mockPrisma };
});
jest.mock('nanoid', () => ({ nanoid: () => 'ABC123' }));
jest.mock('../integrations/payments/PaymentProviderRegistry', () => ({
  getPaymentAdapter: jest.fn(),
}));

import { prisma } from '../config/prisma';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';
import { WalletService } from './WalletService';

const mockedPrisma = prisma as unknown as {
  wallet: { upsert: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  walletTransaction: { create: jest.Mock; findMany: jest.Mock };
  walletTopUp: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockedGetAdapter = getPaymentAdapter as jest.Mock;

describe('WalletService.credit', () => {
  const service = new WalletService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceXof: 1000 });
  });

  it('crédite le solde et enregistre une transaction positive', async () => {
    await service.credit('u1', 5000, 'CREDIT_REFUND' as any, 'Remboursement commande RID-1', 'order-1');

    expect(mockedPrisma.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        walletId: 'w1',
        amountXof: 5000,
        type: 'CREDIT_REFUND',
        reason: 'Remboursement commande RID-1',
        referenceId: 'order-1',
      },
    });
  });

  it('rejette un montant négatif ou nul', async () => {
    await expect(service.credit('u1', 0, 'CREDIT_ADMIN' as any, 'test')).rejects.toThrow(
      'Le montant à créditer doit être positif'
    );
    await expect(service.credit('u1', -100, 'CREDIT_ADMIN' as any, 'test')).rejects.toThrow();
  });
});

describe('WalletService.debit - même schéma anti-race-condition que LoyaltyService.redeemPoints', () => {
  const service = new WalletService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceXof: 3000 });
  });

  it('débite normalement quand le solde est suffisant', async () => {
    mockedPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });

    const used = await service.debit('u1', 2000, 'DEBIT_ORDER_PAYMENT' as any, 'Paiement commande');

    expect(used).toBe(2000);
    expect(mockedPrisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', balanceXof: { gte: 2000 } },
      data: { balanceXof: { decrement: 2000 } },
    });
    expect(mockedPrisma.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        walletId: 'w1',
        amountXof: -2000,
        type: 'DEBIT_ORDER_PAYMENT',
        reason: 'Paiement commande',
        referenceId: undefined,
      },
    });
  });

  it('ne débite jamais plus que le solde disponible (plafonne automatiquement)', async () => {
    mockedPrisma.wallet.updateMany.mockResolvedValue({ count: 1 });

    const used = await service.debit('u1', 10000, 'DEBIT_ORDER_PAYMENT' as any, 'test');

    expect(used).toBe(3000); // plafonné au solde réel
  });

  it('retente avec le solde réel si un débit concurrent a déjà eu lieu, sans jamais aller en négatif', async () => {
    mockedPrisma.wallet.updateMany.mockResolvedValueOnce({ count: 0 });
    mockedPrisma.wallet.findUnique.mockResolvedValueOnce({ id: 'w1', balanceXof: 500 });
    mockedPrisma.wallet.updateMany.mockResolvedValueOnce({ count: 1 });

    const used = await service.debit('u1', 3000, 'DEBIT_ORDER_PAYMENT' as any, 'test');

    expect(used).toBe(500);
  });

  it('renvoie 0 sans écrire pour un montant nul ou négatif', async () => {
    expect(await service.debit('u1', 0, 'DEBIT_ORDER_PAYMENT' as any, 'test')).toBe(0);
    expect(await service.debit('u1', -50, 'DEBIT_ORDER_PAYMENT' as any, 'test')).toBe(0);
    expect(mockedPrisma.wallet.updateMany).not.toHaveBeenCalled();
  });
});

describe('WalletService.refundOrderToWallet', () => {
  const service = new WalletService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceXof: 0 });
  });

  it('crédite le wallet avec le type CREDIT_REFUND et référence la commande', async () => {
    await service.refundOrderToWallet('u1', 'order-1', 7500, 'RID-2026-XYZ');

    expect(mockedPrisma.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        walletId: 'w1',
        amountXof: 7500,
        type: 'CREDIT_REFUND',
        reason: 'Remboursement commande RID-2026-XYZ',
        referenceId: 'order-1',
      },
    });
  });
});

describe('WalletService.initiateTopUp / confirmTopUp', () => {
  const service = new WalletService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.wallet.upsert.mockResolvedValue({ id: 'w1', userId: 'u1', balanceXof: 0 });
  });

  it('crée un dépôt en attente lors de l\'initiation', async () => {
    mockedGetAdapter.mockReturnValue({
      initiatePayment: jest.fn().mockResolvedValue({
        success: true,
        providerTxnId: 'txn-topup-1',
        paymentUrl: 'https://pay.test',
      }),
    });

    await service.initiateTopUp('u1', 5000, 'WAVE' as any, '+22670000000', 'Ria');

    expect(mockedPrisma.walletTopUp.create).toHaveBeenCalledWith({
      data: {
        walletId: 'w1',
        amountXof: 5000,
        provider: 'WAVE',
        providerTxnId: 'txn-topup-1',
        status: 'PENDING',
        metadata: { payToken: null, amountXof: 5000 },
      },
    });
  });

  it("ne crédite jamais deux fois un dépôt déjà confirmé (idempotence webhook redélivré)", async () => {
    mockedPrisma.walletTopUp.findUnique.mockResolvedValue({
      id: 'topup-1',
      walletId: 'w1',
      amountXof: 5000,
      status: 'SUCCEEDED', // déjà traité
      provider: 'WAVE',
    });

    await service.confirmTopUp('txn-topup-1');

    expect(mockedGetAdapter).not.toHaveBeenCalled();
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("retourne false si ce n'est pas un dépôt connu (laisse OrderService gérer)", async () => {
    mockedPrisma.walletTopUp.findUnique.mockResolvedValue(null);

    const handled = await service.confirmTopUp('txn-commande-normale');

    expect(handled).toBe(false);
  });
});
