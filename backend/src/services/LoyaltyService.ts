import { prisma } from '../config/prisma';

// Valeurs par défaut si l'admin n'a jamais rien configuré (voir GET/PATCH
// /admin/settings). Gardées ici comme fallback pour ne jamais planter si un
// réglage manque en base - jamais utilisées si un SystemSetting existe.
const DEFAULT_POINTS_PER_XOF_SPENT = 1 / 1000; // 1 point tous les 1000 FCFA dépensés
const DEFAULT_REFERRAL_BONUS_POINTS = 500;
const DEFAULT_TIER_THRESHOLDS: { tier: string; minPoints: number }[] = [
  { tier: 'platine', minPoints: 5000 },
  { tier: 'or', minPoints: 2000 },
  { tier: 'argent', minPoints: 500 },
  { tier: 'bronze', minPoints: 0 },
];

export class LoyaltyService {
  /** Lit les paramètres de fidélité configurés par l'admin, avec fallback sur les valeurs par défaut. */
  private async getSettings() {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ['loyaltyPointsPerXof', 'loyaltyReferralBonusPoints', 'loyaltyTierThresholds'] } },
    });
    const asMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      pointsPerXof: (asMap.loyaltyPointsPerXof as number) ?? DEFAULT_POINTS_PER_XOF_SPENT,
      referralBonusPoints: (asMap.loyaltyReferralBonusPoints as number) ?? DEFAULT_REFERRAL_BONUS_POINTS,
      tierThresholds:
        (asMap.loyaltyTierThresholds as { tier: string; minPoints: number }[]) ?? DEFAULT_TIER_THRESHOLDS,
    };
  }

  private computeTier(lifetimePoints: number, thresholds: { tier: string; minPoints: number }[]): string {
    return thresholds.find((t) => lifetimePoints >= t.minPoints)?.tier ?? 'bronze';
  }

  async getOrCreateAccount(userId: string) {
    return prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getAccountWithHistory(userId: string) {
    const account = await this.getOrCreateAccount(userId);
    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { ...account, transactions };
  }

  /** Attribue des points automatiquement quand une commande est livrée (1 point / 1000 XOF) */
  /**
   * Correction bug : aucune vérification n'empêchait d'attribuer les points
   * plusieurs fois pour la même commande (ex: double webhook transporteur,
   * double-clic admin sur "marquer comme livré"). On vérifie maintenant
   * qu'aucune transaction de points n'existe déjà pour cette commande avant
   * d'en créer une nouvelle.
   */
  async awardPointsForOrder(userId: string, orderId: string, totalXof: number) {
    const alreadyAwarded = await prisma.loyaltyTransaction.findFirst({
      where: { referenceId: orderId, reason: 'Commande livrée' },
    });
    if (alreadyAwarded) return;

    const settings = await this.getSettings();
    const points = Math.floor(totalXof * settings.pointsPerXof);
    if (points <= 0) return;

    const account = await this.getOrCreateAccount(userId);
    const newLifetime = account.lifetimePoints + points;

    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pointsBalance: { increment: points },
          lifetimePoints: newLifetime,
          tier: this.computeTier(newLifetime, settings.tierThresholds),
        },
      }),
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, points, reason: 'Commande livrée', referenceId: orderId },
      }),
    ]);
  }

  /**
   * Dépense des points au checkout - conversion fixe 1 point = 1 FCFA de remise.
   * Vérifie le solde avant de débiter, jamais de solde négatif.
   *
   * Correction race condition : deux dépenses simultanées lisaient auparavant
   * le même solde (ex: 100 points) puis débitaient chacune 100 séparément,
   * pouvant amener le solde à -100. Le débit est maintenant conditionné dans
   * son `where` (pointsBalance >= pointsToUse) : si une requête concurrente a
   * déjà débité entre-temps, ce `updateMany` n'affecte aucune ligne et on le
   * sait immédiatement (count === 0) plutôt que de laisser passer un solde négatif.
   */
  async redeemPoints(userId: string, points: number): Promise<number> {
    if (points <= 0) return 0;

    const account = await this.getOrCreateAccount(userId);
    let pointsToUse = Math.min(points, account.pointsBalance);
    if (pointsToUse <= 0) return 0;

    // On retente avec le solde réel si une contention a fait échouer la première tentative
    // (au maximum une fois : au deuxième échec, un solde ailleurs a bougé plus vite que nous).
    for (let attempt = 0; attempt < 2; attempt++) {
      const debit = await prisma.loyaltyAccount.updateMany({
        where: { id: account.id, pointsBalance: { gte: pointsToUse } },
        data: { pointsBalance: { decrement: pointsToUse } },
      });

      if (debit.count > 0) {
        await prisma.loyaltyTransaction.create({
          data: { accountId: account.id, points: -pointsToUse, reason: 'Utilisés au checkout' },
        });
        return pointsToUse; // = la remise en FCFA appliquée (1 point = 1 FCFA)
      }

      // Le solde a changé entre-temps : on relit la vraie valeur avant de retenter.
      const fresh = await prisma.loyaltyAccount.findUnique({ where: { id: account.id } });
      pointsToUse = Math.min(points, fresh?.pointsBalance ?? 0);
      if (pointsToUse <= 0) return 0;
    }

    return 0;
  }

  /** Points bonus pour un parrainage réussi */
  async awardReferralBonus(userId: string, referredUserName: string) {
    const settings = await this.getSettings();
    const account = await this.getOrCreateAccount(userId);
    const bonusPoints = settings.referralBonusPoints;
    const newLifetime = account.lifetimePoints + bonusPoints;

    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pointsBalance: { increment: bonusPoints },
          lifetimePoints: newLifetime,
          tier: this.computeTier(newLifetime, settings.tierThresholds),
        },
      }),
      prisma.loyaltyTransaction.create({
        data: { accountId: account.id, points: bonusPoints, reason: `Parrainage de ${referredUserName}` },
      }),
    ]);
  }
}

export const loyaltyService = new LoyaltyService();
