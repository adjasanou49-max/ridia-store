jest.mock('../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    referral: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock('nanoid', () => ({ nanoid: () => 'ABCDEFGH' }));
jest.mock('./LoyaltyService', () => ({
  loyaltyService: { awardReferralBonus: jest.fn().mockResolvedValue(undefined) },
}));

import { prisma } from '../config/prisma';
import { loyaltyService } from './LoyaltyService';
import { ReferralService } from './ReferralService';

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  referral: { findUnique: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
};
const mockedLoyalty = loyaltyService as unknown as { awardReferralBonus: jest.Mock };

describe('ReferralService.rewardReferrerOnFirstOrder - correction race condition', () => {
  const service = new ReferralService();
  const referral = {
    id: 'ref-1',
    referrerId: 'referrer-1',
    referredId: 'referred-1',
    rewardPointsGiven: false,
    referred: { firstName: 'Awa' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attribue le bonus quand la réclamation réussit', async () => {
    mockedPrisma.referral.findUnique.mockResolvedValue(referral);
    mockedPrisma.referral.updateMany.mockResolvedValue({ count: 1 });

    await service.rewardReferrerOnFirstOrder('referred-1');

    expect(mockedPrisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 'ref-1', rewardPointsGiven: false },
      data: { rewardPointsGiven: true },
    });
    expect(mockedLoyalty.awardReferralBonus).toHaveBeenCalledWith('referrer-1', 'Awa');
  });

  it("n'attribue pas de second bonus si un appel concurrent a déjà réclamé la récompense (race condition)", async () => {
    mockedPrisma.referral.findUnique.mockResolvedValue(referral);
    // Simule un appel concurrent ayant déjà marqué rewardPointsGiven à true entre-temps.
    mockedPrisma.referral.updateMany.mockResolvedValue({ count: 0 });

    await service.rewardReferrerOnFirstOrder('referred-1');

    expect(mockedLoyalty.awardReferralBonus).not.toHaveBeenCalled();
  });

  it('ne fait rien si aucun parrainage associé', async () => {
    mockedPrisma.referral.findUnique.mockResolvedValue(null);

    await service.rewardReferrerOnFirstOrder('referred-sans-parrain');

    expect(mockedPrisma.referral.updateMany).not.toHaveBeenCalled();
    expect(mockedLoyalty.awardReferralBonus).not.toHaveBeenCalled();
  });

  it('ne fait rien si le bonus a déjà été donné (lu directement true)', async () => {
    mockedPrisma.referral.findUnique.mockResolvedValue({ ...referral, rewardPointsGiven: true });

    await service.rewardReferrerOnFirstOrder('referred-1');

    expect(mockedPrisma.referral.updateMany).not.toHaveBeenCalled();
    expect(mockedLoyalty.awardReferralBonus).not.toHaveBeenCalled();
  });
});

describe('ReferralService.applyReferralCode', () => {
  const service = new ReferralService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignore silencieusement un code invalide (ne bloque jamais une inscription)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.applyReferralCode('new-user', 'CODE-INEXISTANT')).resolves.toBeUndefined();
    expect(mockedPrisma.referral.create).not.toHaveBeenCalled();
  });

  it('empêche un auto-parrainage', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'same-user' });

    await service.applyReferralCode('same-user', 'RID-ABCDEFGH');

    expect(mockedPrisma.referral.create).not.toHaveBeenCalled();
  });

  it('ne crée pas de doublon si un parrainage existe déjà pour ce filleul', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'referrer-1' });
    mockedPrisma.referral.findUnique.mockResolvedValue({ id: 'existing-ref' });

    await service.applyReferralCode('new-user', 'RID-ABCDEFGH');

    expect(mockedPrisma.referral.create).not.toHaveBeenCalled();
  });
});
