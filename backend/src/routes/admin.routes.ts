import { Router } from 'express';
import { sellerService } from '../services/SellerService';
import { orderService } from '../services/OrderService';
import { productService } from '../services/ProductService';
import { prisma } from '../config/prisma';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { contentModerationAgent } from '../integrations/ai/ContentModerationAgent';
import { disputeService } from '../services/DisputeService';
import { couponService } from '../services/CouponService';
import { adminInviteService } from '../services/AdminInviteService';
import { salesAgentService } from '../services/SalesAgentService';
import { createCouponSchema, adminUpdateOrderStatusSchema } from '../utils/validators';
import { env } from '../config/env';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MARKETING_AGENT));

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [userCount, sellerCount, productCount, orderStats] = await Promise.all([
      prisma.user.count(),
      prisma.seller.count({ where: { status: 'APPROVED' } }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.order.aggregate({ _sum: { totalXof: true }, _count: true }),
    ]);

    // Tendance 30 jours : commandes qui comptent réellement pour le CA
    // (annulées/remboursées exclues, comme pour le GMV total ci-dessus dans
    // l'esprit - ici on garde tout sauf CANCELLED pour la comparaison visuelle).
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const previousPeriodStart = new Date(since);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);

    const [recentOrders, previousPeriodOrders] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
        select: { createdAt: true, totalXof: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Période équivalente juste avant, pour calculer une évolution en %
      // (comme "+12% vs période précédente" sur un vrai dashboard pro).
      prisma.order.aggregate({
        where: { createdAt: { gte: previousPeriodStart, lt: since }, status: { not: 'CANCELLED' } },
        _sum: { totalXof: true },
        _count: true,
      }),
    ]);

    // Regroupement par jour (YYYY-MM-DD) - un jour sans commande apparaît à 0,
    // pour que le graphique ne saute pas de dates et reste lisible.
    const dailyMap = new Map<string, { revenueXof: number; orderCount: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i + 1);
      dailyMap.set(d.toISOString().slice(0, 10), { revenueXof: 0, orderCount: 0 });
    }
    for (const order of recentOrders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (entry) {
        entry.revenueXof += Number(order.totalXof);
        entry.orderCount += 1;
      }
    }
    const dailyTrend = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }));

    const currentPeriodRevenue = recentOrders.reduce((sum, o) => sum + Number(o.totalXof), 0);
    const previousPeriodRevenue = Number(previousPeriodOrders._sum.totalXof || 0);
    const revenueTrendPercent =
      previousPeriodRevenue > 0
        ? Math.round(((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100)
        : null;
    const orderTrendPercent =
      previousPeriodOrders._count > 0
        ? Math.round(((recentOrders.length - previousPeriodOrders._count) / previousPeriodOrders._count) * 100)
        : null;

    // Top 5 produits par chiffre d'affaires cumulé (toutes commandes confondues)
    const topProductsRaw = await prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      _sum: { totalXof: true, quantity: true },
      orderBy: { _sum: { totalXof: 'desc' } },
      take: 5,
    });
    const topProducts = topProductsRaw.map((p) => ({
      productId: p.productId,
      name: p.productName,
      revenueXof: Number(p._sum.totalXof || 0),
      unitsSold: p._sum.quantity || 0,
    }));

    // Dernières commandes (avec client) - vue "activité récente" d'un vrai back-office
    const latestOrders = await prisma.order.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalXof: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    // Compteurs pour la barre d'alertes prioritaires (ce qui attend une action admin)
    const [pendingSellers, pendingProducts, openDisputes] = await Promise.all([
      prisma.seller.count({ where: { status: 'PENDING' } }),
      prisma.product.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    ]);

    res.json({
      userCount,
      sellerCount,
      productCount,
      totalGMV: orderStats._sum.totalXof || 0,
      totalOrders: orderStats._count,
      dailyTrend,
      topProducts,
      revenueTrendPercent,
      orderTrendPercent,
      latestOrders: latestOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalXof: Number(o.totalXof),
        createdAt: o.createdAt,
        customerName: `${o.user.firstName} ${o.user.lastName}`,
      })),
      alerts: { pendingSellers, pendingProducts, openDisputes },
    });
  })
);

router.get(
  '/sellers/pending',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const sellers = await prisma.seller.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        storeName: true,
        storeSlug: true,
        storeDescription: true,
        status: true,
        createdAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
        // Jamais renvoyé ici : bankAccountName/Number, bankName, mobileMoneyNumber,
        // commissionRate (données financières sensibles du vendeur)
      },
    });
    res.json(sellers);
  })
);

router.patch(
  '/sellers/:id/approve',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const seller = await sellerService.approveSeller(req.params.id);
    res.json(seller);
  })
);

router.patch(
  '/sellers/:id/suspend',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const seller = await sellerService.suspendSeller(req.params.id, reason);
    res.json(seller);
  })
);

router.get(
  '/products/pending',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { status: 'PENDING_REVIEW' },
      select: {
        id: true,
        name: true,
        description: true,
        basePriceXof: true,
        stockQuantity: true,
        brand: true,
        weight: true,
        tags: true,
        status: true,
        createdAt: true,
        category: { select: { name: true } },
        images: { take: 1 },
        seller: { select: { storeName: true } },
        // Jamais renvoyé ici (réservé au SUPER_ADMIN via /admin/products/margins) :
        // costPriceCny, costPriceXof, marginPercent, exchangeRate, originalName/Description
        ...(req.auth?.role === 'SUPER_ADMIN' ? { costPriceCny: true, marginPercent: true } : {}),
      },
    });
    res.json(products);
  })
);

router.patch(
  '/products/:id/approve',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', publishedAt: new Date() },
      select: { id: true, name: true, status: true, publishedAt: true },
    });
    res.json(product);
  })
);

router.patch(
  '/products/:id/reject',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED' },
      select: { id: true, name: true, status: true },
    });
    res.json(product);
  })
);

// Mise en avant à l'accueil (merchandising) - c'est le levier principal de
// l'Agent Marketing sur le catalogue : il ne peut ni approuver/rejeter un
// produit (trust & safety) ni changer son prix (vendeur/marge), seulement
// décider ce qui est mis en avant.
router.patch(
  '/products/:id/featured',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MARKETING_AGENT),
  asyncHandler(async (req, res) => {
    const { isFeatured } = req.body;
    if (typeof isFeatured !== 'boolean') throw new AppError('isFeatured (booléen) requis', 422);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isFeatured },
      select: { id: true, name: true, isFeatured: true },
    });
    res.json(product);
  })
);

router.get(
  '/orders',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize, dateFrom, dateTo } = req.query;
    const take = pageSize ? Number(pageSize) : 30;
    const skip = ((page ? Number(page) : 1) - 1) * take;

    // Filtre date optionnel - inclusif sur les deux bornes. dateTo est poussé
    // à la fin de la journée (23:59:59.999) pour inclure toutes les commandes
    // du jour sélectionné, pas seulement celles avant minuit pile.
    const createdAtFilter =
      dateFrom || dateTo
        ? {
            ...(dateFrom ? { gte: new Date(dateFrom as string) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
          }
        : undefined;

    const where = {
      ...(status ? { status: status as any } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ items, pagination: { total, page: page || 1, pageSize: take } });
  })
);

router.get(
  '/orders/:id',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const order = await orderService.getOrderByIdAdmin(req.params.id);

    // Un ADMIN classique voit la commande pour la gérer (statut, tracking, client)
    // mais jamais la commission Ridia ni la part reversée au vendeur - réservé au SUPER_ADMIN.
    if (req.auth?.role !== 'SUPER_ADMIN') {
      order.items = order.items.map(({ commissionXof, sellerPayoutXof, ...safe }: any) => safe);
    }

    res.json(order);
  })
);

router.patch(
  '/orders/:id/status',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { status, note } = adminUpdateOrderStatusSchema.parse(req.body);
    const order = await orderService.adminUpdateOrderStatus(req.params.id, status, note);
    res.json(order);
  })
);

router.get(
  '/users',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q } = req.query;
    const take = pageSize ? Number(pageSize) : 30;
    const skip = ((page ? Number(page) : 1) - 1) * take;

    const where = q
      ? {
          OR: [
            { email: { contains: String(q), mode: 'insensitive' as const } },
            { firstName: { contains: String(q), mode: 'insensitive' as const } },
            { lastName: { contains: String(q), mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ items, pagination: { total, page: page || 1, pageSize: take } });
  })
);

// Promotion de rôle - réservé au SUPER_ADMIN uniquement (jamais accessible via signup public)
router.patch(
  '/users/:id/role',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!Object.values(UserRole).includes(role)) {
      return res.status(422).json({ error: 'Rôle invalide' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    res.json(user);
  })
);

/**
 * Correction faille de privilège : rien n'empêchait un ADMIN classique de
 * désactiver le compte d'un autre ADMIN, voire d'un SUPER_ADMIN - risque réel
 * de verrouillage (lockout) du vrai propriétaire par un compte admin
 * compromis ou malveillant. Seul un SUPER_ADMIN peut désactiver un autre
 * compte ADMIN/SUPER_ADMIN ; les comptes CUSTOMER/SELLER restent gérables
 * par n'importe quel ADMIN.
 */
export function canDeactivateTarget(actorRole: string | undefined, targetRole: string): boolean {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(targetRole)) return true;
  return actorRole === 'SUPER_ADMIN';
}

// Désactiver un compte (ban) - ADMIN ou SUPER_ADMIN
router.patch(
  '/users/:id/deactivate',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!target) throw new AppError('Utilisateur non trouvé', 404);
    if (!canDeactivateTarget(req.auth?.role, target.role)) {
      throw new AppError('Seul un SUPER_ADMIN peut désactiver un compte administrateur', 403);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });
    res.json(user);
  })
);

// Paramètres système - lecture/écriture réservées au SUPER_ADMIN
router.get(
  '/settings',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'cnyToXofRate',
            'defaultCommissionRate',
            'defaultMarginPercent',
            'displayCurrencyRates',
            'enabledPaymentProviders',
            'loyaltyPointsPerXof',
            'loyaltyReferralBonusPoints',
            'loyaltyTierThresholds',
            'siteOgImageUrl',
          ],
        },
      },
    });
    const asMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    res.json({
      cnyToXofRate: asMap.cnyToXofRate ?? env.CNY_TO_XOF_RATE,
      defaultCommissionRate: asMap.defaultCommissionRate ?? 15,
      defaultMarginPercent: asMap.defaultMarginPercent ?? null,
      displayCurrencyRates: asMap.displayCurrencyRates ?? {
        USD: 0.0016,
        EUR: 0.0015,
        NGN: 2.5,
        GHS: 0.024,
      },
      // Tous activés par défaut - le vendeur les désactive un par un si besoin
      // (ex: pas encore de contrat signé avec tel opérateur mobile money).
      enabledPaymentProviders: asMap.enabledPaymentProviders ?? {
        WAVE: true,
        ORANGE_MONEY: true,
        MTN_MONEY: true,
        CUSTOM: false,
      },
      // Fidélité - 1 point / 1000 FCFA dépensés par défaut, 500 points de bonus
      // parrainage, paliers bronze/argent/or/platine par défaut.
      loyaltyPointsPerXof: asMap.loyaltyPointsPerXof ?? 1 / 1000,
      loyaltyReferralBonusPoints: asMap.loyaltyReferralBonusPoints ?? 500,
      loyaltyTierThresholds: asMap.loyaltyTierThresholds ?? [
        { tier: 'platine', minPoints: 5000 },
        { tier: 'or', minPoints: 2000 },
        { tier: 'argent', minPoints: 500 },
        { tier: 'bronze', minPoints: 0 },
      ],
      // Image de partage par défaut (WhatsApp/Facebook/Twitter) pour toute page
      // qui n'a pas sa propre image (les fiches produit ont déjà la leur).
      // null -> le frontend retombe sur l'icône de l'app.
      siteOgImageUrl: asMap.siteOgImageUrl ?? null,
    });
  })
);

/**
 * Correction : LoyaltyService.computeTier fait un .find() dans l'ordre du
 * tableau - si les paliers ne sont pas strictement décroissants (erreur de
 * saisie admin), un client pourrait se voir attribuer le mauvais palier
 * (ex: "argent" avant "or" alors qu'il a assez de points pour "or").
 */
export function validateTierThresholdsOrder(
  thresholds: { tier: string; minPoints: number }[]
): string | null {
  for (let i = 1; i < thresholds.length; i++) {
    if (thresholds[i].minPoints >= thresholds[i - 1].minPoints) {
      return `Les paliers de fidélité doivent être strictement décroissants (problème entre "${thresholds[i - 1].tier}" et "${thresholds[i].tier}")`;
    }
  }
  return null;
}

router.patch(
  '/settings',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const {
      cnyToXofRate,
      defaultCommissionRate,
      defaultMarginPercent,
      displayCurrencyRates,
      enabledPaymentProviders,
      loyaltyPointsPerXof,
      loyaltyReferralBonusPoints,
      loyaltyTierThresholds,
      siteOgImageUrl,
    } = req.body;

    if (Array.isArray(loyaltyTierThresholds)) {
      const error = validateTierThresholdsOrder(loyaltyTierThresholds);
      if (error) throw new AppError(error, 422);
    }

    await prisma.$transaction([
      prisma.systemSetting.upsert({
        where: { key: 'cnyToXofRate' },
        create: { key: 'cnyToXofRate', value: cnyToXofRate },
        update: { value: cnyToXofRate },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'defaultCommissionRate' },
        create: { key: 'defaultCommissionRate', value: defaultCommissionRate },
        update: { value: defaultCommissionRate },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'defaultMarginPercent' },
        create: { key: 'defaultMarginPercent', value: defaultMarginPercent },
        update: { value: defaultMarginPercent },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'displayCurrencyRates' },
        create: { key: 'displayCurrencyRates', value: displayCurrencyRates },
        update: { value: displayCurrencyRates },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'enabledPaymentProviders' },
        create: { key: 'enabledPaymentProviders', value: enabledPaymentProviders },
        update: { value: enabledPaymentProviders },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'loyaltyPointsPerXof' },
        create: { key: 'loyaltyPointsPerXof', value: loyaltyPointsPerXof },
        update: { value: loyaltyPointsPerXof },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'loyaltyReferralBonusPoints' },
        create: { key: 'loyaltyReferralBonusPoints', value: loyaltyReferralBonusPoints },
        update: { value: loyaltyReferralBonusPoints },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'loyaltyTierThresholds' },
        create: { key: 'loyaltyTierThresholds', value: loyaltyTierThresholds },
        update: { value: loyaltyTierThresholds },
      }),
      ...(siteOgImageUrl !== undefined
        ? [
            prisma.systemSetting.upsert({
              where: { key: 'siteOgImageUrl' },
              create: { key: 'siteOgImageUrl', value: siteOgImageUrl },
              update: { value: siteOgImageUrl },
            }),
          ]
        : []),
    ]);

    res.json({
      cnyToXofRate,
      defaultCommissionRate,
      defaultMarginPercent,
      displayCurrencyRates,
      enabledPaymentProviders,
      loyaltyPointsPerXof,
      loyaltyReferralBonusPoints,
      loyaltyTierThresholds,
      siteOgImageUrl,
    });
  })
);

// ---------------- Catégories (marges incluses) - SUPER_ADMIN exclusivement ----------------
router.get(
  '/categories',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    res.json(categories);
  })
);

router.post(
  '/categories',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { name, parentId, iconUrl, sortOrder, defaultMarginPercent } = req.body;
    const slug = String(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        parentId: parentId || null,
        iconUrl,
        sortOrder: sortOrder ?? 0,
        defaultMarginPercent: defaultMarginPercent ?? null,
      },
    });
    res.status(201).json(category);
  })
);

router.patch(
  '/categories/:id',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { name, parentId, iconUrl, sortOrder, isActive, defaultMarginPercent } = req.body;
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name, parentId, iconUrl, sortOrder, isActive, defaultMarginPercent },
    });
    res.json(category);
  })
);

router.delete(
  '/categories/:id',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const productCount = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (productCount > 0) {
      return res.status(422).json({
        error: `Impossible de supprimer - ${productCount} produit(s) utilisent encore cette catégorie`,
      });
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---------------- Audit & correction des marges - SUPER_ADMIN exclusivement ----------------
router.get(
  '/products/margins',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { categoryId, belowMargin, page, pageSize } = req.query;
    const result = await productService.listProductMargins({
      categoryId: categoryId as string | undefined,
      belowMargin: belowMargin ? Number(belowMargin) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
    res.json(result);
  })
);

router.patch(
  '/products/:id/margin',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { marginPercent } = req.body;
    if (typeof marginPercent !== 'number') throw new AppError('marginPercent requis (nombre)', 422);
    const product = await productService.correctProductMargin(req.params.id, marginPercent);
    res.json(product);
  })
);

router.patch(
  '/products/bulk-margin',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { categoryId, productIds, newMarginPercent } = req.body;
    if (typeof newMarginPercent !== 'number') throw new AppError('newMarginPercent requis (nombre)', 422);
    const result = await productService.bulkCorrectMargin({ categoryId, productIds, newMarginPercent });
    res.json(result);
  })
);

// ---------------- Agent IA de modération - SUPER_ADMIN exclusivement, invisible des ADMIN ----------------
router.get(
  '/ai/blacklist',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.blacklistedWord.findMany({ orderBy: { word: 'asc' } });
    res.json(rows);
  })
);

router.post(
  '/ai/blacklist',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { word } = req.body;
    if (!word || !String(word).trim()) throw new AppError('Mot requis', 422);
    await contentModerationAgent.addWord(word);
    const rows = await prisma.blacklistedWord.findMany({ orderBy: { word: 'asc' } });
    res.status(201).json(rows);
  })
);

router.delete(
  '/ai/blacklist/:id',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await contentModerationAgent.removeWord(req.params.id);
    res.status(204).send();
  })
);

// Test rapide de l'agent - permet de vérifier le rendu avant de publier un vrai produit
router.post(
  '/ai/test-sanitize',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    if (!text) throw new AppError('Texte requis', 422);
    const result = await contentModerationAgent.sanitizeDescription(text);
    res.json({ original: text, cleaned: result });
  })
);

// ---------------- Litiges (visibles ADMIN + SUPER_ADMIN) ----------------
router.get(
  '/disputes',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const disputes = await disputeService.getAllDisputes(req.query.status as string | undefined);
    res.json(disputes);
  })
);

router.patch(
  '/disputes/:id/resolve',
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { resolution, outcome } = req.body;
    if (!['RESOLVED_REFUNDED', 'RESOLVED_REJECTED'].includes(outcome)) {
      throw new AppError('outcome invalide', 422);
    }
    const dispute = await disputeService.resolveDispute(req.params.id, req.auth!.userId, resolution, outcome);
    res.json(dispute);
  })
);

// ---------------- Codes promo - SUPER_ADMIN + Agent Marketing ----------------
router.get(
  '/coupons',
  authorize(UserRole.SUPER_ADMIN, UserRole.MARKETING_AGENT),
  asyncHandler(async (_req, res) => {
    const coupons = await couponService.listAll();
    res.json(coupons);
  })
);

router.post(
  '/coupons',
  authorize(UserRole.SUPER_ADMIN, UserRole.MARKETING_AGENT),
  asyncHandler(async (req, res) => {
    const data = createCouponSchema.parse(req.body);
    const coupon = await couponService.create({
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    res.status(201).json(coupon);
  })
);

router.patch(
  '/coupons/:id/toggle',
  authorize(UserRole.SUPER_ADMIN, UserRole.MARKETING_AGENT),
  asyncHandler(async (req, res) => {
    const coupon = await couponService.toggleActive(req.params.id, req.body.isActive);
    res.json(coupon);
  })
);

// ---------------- Codes d'invitation admin - SUPER_ADMIN exclusivement ----------------
// Aucun ADMIN classique ne peut générer de code, seulement le propriétaire.
router.get(
  '/invite-codes',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const codes = await adminInviteService.listCodes();
    res.json(codes);
  })
);

router.post(
  '/invite-codes',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const expiresInHours = req.body.expiresInHours ? Number(req.body.expiresInHours) : 72;
    const intendedRole =
      req.body.intendedRole === 'PURCHASING_AGENT'
        ? UserRole.PURCHASING_AGENT
        : req.body.intendedRole === 'SELLER'
          ? UserRole.SELLER
          : req.body.intendedRole === 'MARKETING_AGENT'
            ? UserRole.MARKETING_AGENT
            : req.body.intendedRole === 'SALES_AGENT'
              ? UserRole.SALES_AGENT
              : UserRole.ADMIN;
    const invite = await adminInviteService.generateCode(req.auth!.userId, expiresInHours, intendedRole, {
      commissionPercent: req.body.commissionPercent ? Number(req.body.commissionPercent) : undefined,
      monthlyThresholdXof: req.body.monthlyThresholdXof ? Number(req.body.monthlyThresholdXof) : undefined,
    });
    res.status(201).json(invite);
  })
);

// ---------------- Agents commerciaux (contrats de commission) - SUPER_ADMIN exclusivement ----------------
// Sensible : conditions financières négociées individuellement, pas pour un ADMIN classique.
router.get(
  '/sales-agents',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const agents = await salesAgentService.listAllWithCurrentMonth();
    res.json(agents);
  })
);

router.patch(
  '/sales-agents/:id',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { commissionPercent, monthlyThresholdXof, status } = req.body;
    const agent = await salesAgentService.updateTerms(req.params.id, {
      commissionPercent: commissionPercent !== undefined ? Number(commissionPercent) : undefined,
      monthlyThresholdXof: monthlyThresholdXof !== undefined ? Number(monthlyThresholdXof) : undefined,
      status,
    });
    res.json(agent);
  })
);

router.get(
  '/sales-agents/:id/orders',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const result = await salesAgentService.getOrdersByAgentId(req.params.id, page, 20);
    res.json(result);
  })
);

router.delete(
  '/invite-codes/:id',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await adminInviteService.revokeCode(req.params.id);
    res.status(204).send();
  })
);

export default router;
