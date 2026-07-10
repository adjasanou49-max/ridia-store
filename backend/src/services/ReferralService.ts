import { nanoid } from 'nanoid';
import { prisma } from '../config/prisma';
import { loyaltyService } from './LoyaltyService';

export class ReferralService {
  /** Génère (ou renvoie) le code de parrainage personnel de l'utilisateur */
  async getOrCreateMyCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (user?.referralCode) return user.referralCode;

    const code = `RID-${nanoid(8).toUpperCase()}`;
    await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
    return code;
  }

  /** Applique un code de parrainage à l'inscription d'un nouvel utilisateur */
  async applyReferralCode(newUserId: string, code: string) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer) return; // code invalide - on ignore silencieusement, ne bloque pas l'inscription
    if (referrer.id === newUserId) return; // ne peut pas se parrainer soi-même

    const already = await prisma.referral.findUnique({ where: { referredId: newUserId } });
    if (already) return;

    await prisma.referral.create({
      data: { referrerId: referrer.id, referredId: newUserId, code },
    });
  }

  /** Récompense le parrain quand le filleul passe sa première commande */
  async rewardReferrerOnFirstOrder(referredUserId: string) {
    const referral = await prisma.referral.findUnique({
      where: { referredId: referredUserId },
      include: { referred: { select: { firstName: true } } },
    });
    if (!referral || referral.rewardPointsGiven) return;

    await loyaltyService.awardReferralBonus(referral.referrerId, referral.referred.firstName);
    await prisma.referral.update({ where: { id: referral.id }, data: { rewardPointsGiven: true } });
  }

  async getMyReferrals(userId: string) {
    return prisma.referral.findMany({
      where: { referrerId: userId },
      include: { referred: { select: { firstName: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const referralService = new ReferralService();
