jest.mock('nanoid', () => ({ nanoid: () => 'MOCKEDID1234' }));

// Rôles utilisés dans les tests (évite de dépendre du client Prisma généré,
// dont l'enum UserRole n'est disponible qu'après `prisma generate`).
const UserRole = { CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN', SELLER: 'SELLER' } as const;

// Mock complet de prisma : $transaction exécute directement le callback en lui
// passant le même mock (tx === prisma mocké), ce qui suffit pour tester la
// logique métier sans base de données réelle.
jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    adminInviteCode: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  mockPrisma.$transaction = jest.fn(async (callback: (tx: any) => any) => callback(mockPrisma));
  return { prisma: mockPrisma };
});

import { prisma } from '../config/prisma';
import { AdminInviteService } from './AdminInviteService';

const mockedPrisma = prisma as unknown as {
  adminInviteCode: { findUnique: jest.Mock; updateMany: jest.Mock };
  user: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('AdminInviteService.redeemCode - correction race condition', () => {
  const service = new AdminInviteService();
  const baseInvite = {
    id: 'invite-1',
    code: 'ADMIN-XYZ',
    usedBy: null,
    intendedRole: UserRole.ADMIN,
    expiresAt: new Date(Date.now() + 3600_000),
  };
  const baseUser = { id: 'user-1', role: UserRole.CUSTOMER };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("attribue le rôle quand le code est encore libre au moment de l'écriture", async () => {
    mockedPrisma.adminInviteCode.findUnique.mockResolvedValue(baseInvite);
    mockedPrisma.user.findUnique.mockResolvedValue(baseUser);
    mockedPrisma.adminInviteCode.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.user.update.mockResolvedValue({ ...baseUser, role: UserRole.ADMIN });

    await expect(service.redeemCode('user-1', 'ADMIN-XYZ')).resolves.toBeUndefined();

    expect(mockedPrisma.adminInviteCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', usedBy: null },
      data: expect.objectContaining({ usedBy: 'user-1' }),
    });
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: UserRole.ADMIN },
    });
  });

  it('refuse et ne modifie pas le rôle si le code a été réclamé entre-temps (race condition)', async () => {
    mockedPrisma.adminInviteCode.findUnique.mockResolvedValue(baseInvite);
    mockedPrisma.user.findUnique.mockResolvedValue(baseUser);
    // Simule une deuxième requête concurrente qui a déjà consommé le code :
    // updateMany conditionné sur usedBy: null n'affecte donc aucune ligne.
    mockedPrisma.adminInviteCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.redeemCode('user-2', 'ADMIN-XYZ')).rejects.toThrow(
      'Ce code a déjà été utilisé'
    );

    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuse si le code est déjà marqué utilisé dès la lecture initiale', async () => {
    mockedPrisma.adminInviteCode.findUnique.mockResolvedValue({
      ...baseInvite,
      usedBy: 'someone-else',
    });

    await expect(service.redeemCode('user-1', 'ADMIN-XYZ')).rejects.toThrow(
      'Ce code a déjà été utilisé'
    );
    expect(mockedPrisma.adminInviteCode.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un code expiré', async () => {
    mockedPrisma.adminInviteCode.findUnique.mockResolvedValue({
      ...baseInvite,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.redeemCode('user-1', 'ADMIN-XYZ')).rejects.toThrow('Ce code a expiré');
  });

  it("refuse si l'utilisateur a déjà un rôle spécial", async () => {
    mockedPrisma.adminInviteCode.findUnique.mockResolvedValue(baseInvite);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: UserRole.SELLER });

    await expect(service.redeemCode('user-1', 'ADMIN-XYZ')).rejects.toThrow(
      'Ce compte a déjà un rôle spécial'
    );
    expect(mockedPrisma.adminInviteCode.updateMany).not.toHaveBeenCalled();
  });
});
