jest.mock('../config/prisma', () => ({
  prisma: {
    dispute: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    order: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    payment: { update: jest.fn() },
  },
}));
jest.mock('../integrations/payments/PaymentProviderRegistry', () => ({
  getPaymentAdapter: jest.fn(),
}));

import { prisma } from '../config/prisma';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';
import { DisputeService } from './DisputeService';

const mockedPrisma = prisma as unknown as {
  dispute: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  order: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  payment: { update: jest.Mock };
};
const mockedGetAdapter = getPaymentAdapter as jest.Mock;

describe('DisputeService.resolveDispute - correction race condition (double remboursement)', () => {
  const service = new DisputeService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('résout le litige et déclenche un remboursement réel quand la réclamation réussit', async () => {
    mockedPrisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.dispute.findUniqueOrThrow.mockResolvedValue({ id: 'd1', orderId: 'order-1' });
    mockedPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      totalXof: 5000,
      payments: [{ id: 'pay-1', providerTxnId: 'txn-1', provider: 'WAVE', status: 'SUCCEEDED' }],
    });
    mockedGetAdapter.mockReturnValue({
      refundPayment: jest.fn().mockResolvedValue({ success: true }),
    });

    await service.resolveDispute('d1', 'admin-1', 'Produit défectueux', 'RESOLVED_REFUNDED');

    expect(mockedPrisma.dispute.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: { notIn: ['RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'CLOSED'] } },
      data: expect.objectContaining({ status: 'RESOLVED_REFUNDED' }),
    });
    expect(mockedPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'REFUNDED' },
    });
  });

  it('refuse et ne déclenche AUCUN remboursement si le litige est déjà résolu (race condition - double-clic ou deux admins)', async () => {
    // Simule une résolution concurrente déjà passée entre-temps : la mise à
    // jour conditionnée n'affecte aucune ligne.
    mockedPrisma.dispute.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolveDispute('d1', 'admin-2', 'Autre décision', 'RESOLVED_REFUNDED')
    ).rejects.toThrow('Ce litige a déjà été résolu');

    expect(mockedPrisma.dispute.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockedGetAdapter).not.toHaveBeenCalled();
    expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
  });

  it('ne déclenche pas de remboursement pour un rejet de litige', async () => {
    mockedPrisma.dispute.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.dispute.findUniqueOrThrow.mockResolvedValue({ id: 'd1', orderId: 'order-1' });

    await service.resolveDispute('d1', 'admin-1', 'Preuve insuffisante', 'RESOLVED_REJECTED');

    expect(mockedGetAdapter).not.toHaveBeenCalled();
  });
});
