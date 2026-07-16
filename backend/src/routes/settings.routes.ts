import { Router } from 'express';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * Réglages publics d'affichage - volontairement séparé de /admin/settings
 * (qui exige SUPER_ADMIN et expose des données sensibles comme les taux de
 * commission). Uniquement ce qui est nécessaire pour le rendu de pages
 * publiques (metadata Open Graph du layout racine, etc.) - jamais de données
 * financières ici.
 */
router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ['siteOgImageUrl', 'businessIfu'] } },
    });
    const asMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ ogImageUrl: asMap.siteOgImageUrl ?? null, businessIfu: asMap.businessIfu ?? null });
  })
);

export default router;
