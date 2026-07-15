import { Router } from 'express';
import multer from 'multer';
import { productService } from '../services/ProductService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { createProductSchema, updatePriceTiersSchema, updateProductSchema } from '../utils/validators';
import { categorySuggestionAgent } from '../integrations/ai/CategorySuggestionAgent';
import { imageSearchAgent } from '../integrations/ai/ImageSearchAgent';
import { imageSearchRateLimiter } from '../middleware/rateLimit';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@prisma/client';

const router = Router();

const imageSearchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Seules les images sont acceptées', 422));
    }
    cb(null, true);
  },
});

// Public: recherche par photo - décrit l'image (IA) puis réutilise la recherche texte classique
router.post(
  '/search-by-image',
  imageSearchRateLimiter,
  imageSearchUpload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('Aucune image reçue', 422);

    const query = await imageSearchAgent.describeImageForSearch(req.file.buffer, req.file.mimetype);
    const result = await productService.searchProducts({
      query,
      page: 1,
      pageSize: 24,
    });
    res.json({ detectedQuery: query, ...result });
  })
);

// Public: search/list products
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      q,
      categoryId,
      sellerId,
      minPrice,
      maxPrice,
      inStock,
      sortBy,
      page,
      pageSize,
      attributes,
      isFeatured,
      lang,
    } = req.query;
    const result = await productService.searchProducts({
      query: q as string,
      categoryId: categoryId as string,
      sellerId: sellerId as string,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      inStockOnly: inStock === 'true',
      isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
      sortBy: sortBy as any,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 24,
      // attributes passé en JSON encodé dans l'URL, ex: {"Couleur":"Rouge"}
      attributes: attributes ? JSON.parse(attributes as string) : undefined,
      lang: lang as string | undefined,
    });
    res.json(result);
  })
);

// Public: product detail
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const product = await productService.getProductBySlug(req.params.slug, req.query.lang as string | undefined);
    res.json(product);
  })
);

// Seller: create product
router.post(
  '/',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const data = createProductSchema.parse(req.body);
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);

    const product = await productService.createProduct({
      sellerId: req.auth.sellerId,
      ...data,
    });
    res.status(201).json(product);
  })
);

// Seller: publish product
router.patch(
  '/:id/publish',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const product = await productService.publishProduct(req.params.id, req.auth.sellerId);
    res.json(product);
  })
);

// Seller: définir les paliers de prix dégressifs (style 1688/Taobao/Pinduoduo)
router.put(
  '/:id/price-tiers',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { tiers } = updatePriceTiersSchema.parse(req.body);
    const result = await productService.setPriceTiers(req.params.id, req.auth.sellerId, tiers);
    res.json(result);
  })
);

// ---------------- Variantes (tailles/couleurs) ----------------
router.get(
  '/:id/variants',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const variants = await productService.getVariants(req.params.id, req.auth.sellerId);
    res.json(variants);
  })
);

router.post(
  '/:id/variants',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const variant = await productService.addVariant(req.params.id, req.auth.sellerId, req.body);
    res.status(201).json(variant);
  })
);

router.patch(
  '/variants/:variantId',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const variant = await productService.updateVariant(req.params.variantId, req.auth.sellerId, req.body);
    res.json(variant);
  })
);

router.delete(
  '/variants/:variantId',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    await productService.deleteVariant(req.params.variantId, req.auth.sellerId);
    res.status(204).send();
  })
);

// Programmer une hausse de prix (urgence client - "profite de ce prix avant qu'il augmente")
router.put(
  '/:id/schedule-price-increase',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { scheduledAt, newPriceXof } = req.body;
    const product = await productService.schedulePriceIncrease(
      req.params.id,
      req.auth.sellerId,
      new Date(scheduledAt),
      Number(newPriceXof)
    );
    res.json(product);
  })
);

router.delete(
  '/:id/schedule-price-increase',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const product = await productService.cancelScheduledPriceIncrease(req.params.id, req.auth.sellerId);
    res.json(product);
  })
);

// Seller: modifier un produit existant
router.patch(
  '/:id',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const data = updateProductSchema.parse(req.body);
    const product = await productService.updateProduct(req.params.id, req.auth.sellerId, data);
    res.json(product);
  })
);

// Seller: réactiver un produit archivé (repasse en brouillon, à republier)
router.patch(
  '/:id/unarchive',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const product = await productService.unarchiveProduct(req.params.id, req.auth.sellerId);
    res.json(product);
  })
);

// Seller: archiver (retirer de la vente) un produit
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    await productService.archiveProduct(req.params.id, req.auth.sellerId);
    res.status(204).send();
  })
);

// Public: taux de change d'AFFICHAGE uniquement (XOF -> devise étrangère), pour le confort
// des clients. La facturation réelle reste toujours en XOF - jamais le taux CNY->XOF
// interne (business sensible) n'est exposé ici.
router.get(
  '/meta/currencies',
  asyncHandler(async (_req, res) => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'displayCurrencyRates' } });
    const rates = (setting?.value as Record<string, number>) ?? {
      USD: 0.0016,
      EUR: 0.0015,
      NGN: 2.5,
      GHS: 0.024,
    };
    res.json({ baseCurrency: 'XOF', rates });
  })
);

/**
 * Public : taux de change CNY->XOF réellement utilisé côté serveur. Sans
 * cette route, le taux était accessible uniquement à l'admin - le formulaire
 * vendeur devait deviner (valeur codée en dur), donnant une estimation de
 * prix fausse dès que l'admin changeait le taux réel.
 */
router.get(
  '/meta/exchange-rate',
  asyncHandler(async (_req, res) => {
    const cnyToXofRate = await productService.getCurrentExchangeRate();
    res.json({ cnyToXofRate });
  })
);

// Public: list categories
router.get(
  '/meta/categories',
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      select: {
        id: true,
        name: true,
        slug: true,
        iconUrl: true,
        sortOrder: true,
        attributes: {
          where: { isFilterable: true },
          select: { id: true, name: true, options: true },
        },
        // Jamais exposé publiquement : defaultMarginPercent (donnée business interne)
        children: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true, iconUrl: true, sortOrder: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const translated = await productService.withCategoryDisplayLanguage(categories, req.query.lang as string | undefined);
    res.json(translated);
  })
);

// Public: liste des moyens de paiement activés - seule la liste des providers
// autorisés est exposée, jamais les autres réglages système (marge, commission).
router.get(
  '/meta/payment-methods',
  asyncHandler(async (_req, res) => {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'enabledPaymentProviders' } });
    const enabled = (row?.value as Record<string, boolean>) ?? {
      WAVE: true,
      ORANGE_MONEY: true,
      MTN_MONEY: true,
      CUSTOM: false,
    };
    const activeProviders = Object.entries(enabled)
      .filter(([, isEnabled]) => isEnabled)
      .map(([provider]) => provider);

    res.json({ activeProviders });
  })
);

// Seller/Admin: agent IA suggère la catégorie la plus pertinente à partir du nom/description
router.post(
  '/suggest-category',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) throw new AppError('Le nom du produit est requis', 422);

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const suggestion = await categorySuggestionAgent.suggestCategory(name, description || '', categories);
    res.json(suggestion);
  })
);

// Admin: définir les attributs filtrables d'une catégorie (ex: Couleur: [Rouge, Bleu])
router.put(
  '/categories/:categoryId/attributes',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { attributes } = req.body as { attributes: { name: string; options: string[] }[] };

    await prisma.$transaction([
      prisma.categoryAttribute.deleteMany({ where: { categoryId: req.params.categoryId } }),
      ...(attributes.length
        ? [
            prisma.categoryAttribute.createMany({
              data: attributes.map((a) => ({
                categoryId: req.params.categoryId,
                name: a.name,
                options: a.options,
              })),
            }),
          ]
        : []),
    ]);

    const result = await prisma.categoryAttribute.findMany({ where: { categoryId: req.params.categoryId } });
    res.json(result);
  })
);

// Seller: choisir les valeurs d'attribut pour son produit (ex: ce produit est "Rouge")
router.put(
  '/:id/attributes',
  authenticate,
  authorize(UserRole.SELLER, UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const product = await prisma.product.findFirst({ where: { id: req.params.id, sellerId: req.auth.sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    const { values } = req.body as { values: { attributeId: string; value: string }[] };

    await prisma.$transaction([
      prisma.productAttributeValue.deleteMany({ where: { productId: req.params.id } }),
      ...(values.length
        ? [
            prisma.productAttributeValue.createMany({
              data: values.map((v) => ({
                productId: req.params.id,
                attributeId: v.attributeId,
                value: v.value,
              })),
            }),
          ]
        : []),
    ]);

    res.status(204).send();
  })
);

export default router;
