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
import { createCouponSchema, adminUpdateOrderStatusSchema } from '../utils/validators';
import { env } from '../config/env';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN));

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

    const recentOrders = await prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, totalXof: true },
      orderBy: { createdAt: 'asc' },
    });

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

    res.json({
      userCount,
      sellerCount,
      productCount,
      totalGMV: orderStats._sum.totalXof || 0,
      totalOrders: orderStats._count,
      dailyTrend,
      topProducts,
    });
  })
);

router.get(
  '/sellers/pending',
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
  asyncHandler(async (req, res) => {
    const seller = await sellerService.approveSeller(req.params.id);
    res.json(seller);
  })
);

router.patch(
  '/sellers/:id/suspend',
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const seller = await sellerService.suspendSeller(req.params.id, reason);
    res.json(seller);
  })
);

router.get(
  '/products/pending',
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
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED' },
      select: { id: true, name: true, status: true },
    });
    res.json(product);
  })
);

router.get(
  '/orders',
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
  asyncHandler(async (req, res) => {
    const { status, note } = adminUpdateOrderStatusSchema.parse(req.body);
    const order = await orderService.adminUpdateOrderStatus(req.params.id, status, note);
    res.json(order);
  })
);

router.get(
  '/users',
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

// Désactiver un compte (ban) - ADMIN ou SUPER_ADMIN
router.patch(
  '/users/:id/deactivate',
  asyncHandler(async (req, res) => {
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
    });
  })
);

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
    } = req.body;

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
  asyncHandler(async (req, res) => {
    const disputes = await disputeService.getAllDisputes(req.query.status as string | undefined);
    res.json(disputes);
  })
);

router.patch(
  '/disputes/:id/resolve',
  asyncHandler(async (req, res) => {
    const { resolution, outcome } = req.body;
    if (!['RESOLVED_REFUNDED', 'RESOLVED_REJECTED'].includes(outcome)) {
      throw new AppError('outcome invalide', 422);
    }
    const dispute = await disputeService.resolveDispute(req.params.id, req.auth!.userId, resolution, outcome);
    res.json(dispute);
  })
);

// ---------------- Codes promo - SUPER_ADMIN exclusivement ----------------
router.get(
  '/coupons',
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const coupons = await couponService.listAll();
    res.json(coupons);
  })
);

router.post(
  '/coupons',
  authorize(UserRole.SUPER_ADMIN),
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
  authorize(UserRole.SUPER_ADMIN),
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
    const intendedRole = req.body.intendedRole === 'PURCHASING_AGENT' ? UserRole.PURCHASING_AGENT : UserRole.ADMIN;
    const invite = await adminInviteService.generateCode(req.auth!.userId, expiresInHours, intendedRole);
    res.status(201).json(invite);
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
