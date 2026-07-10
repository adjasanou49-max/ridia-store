import { Router } from 'express';
import { prisma } from '../config/prisma';
import { scrapeImportService } from '../services/ScrapeImportService';
import { productService } from '../services/ProductService';
import { reviewService } from '../services/ReviewService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate, authorize(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN));

// ---------------- Import initial (appelé par exportToApp du scraper) ----------------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { categoryId, ...scraped } = req.body;
    const result = await scrapeImportService.importScrapedProduct(req.auth.sellerId, scraped, categoryId);
    res.status(201).json(result);
  })
);

// ---------------- Synchronisation (appelée par syncWorker.ts) ----------------

router.get(
  '/tracked-products',
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);

    const products = await prisma.product.findMany({
      where: { sellerId: req.auth.sellerId, sourceUrl: { not: null } },
      select: {
        id: true,
        sourceUrl: true,
        variants: {
          where: { isActive: true },
          select: { id: true, name: true, priceXof: true, stockQuantity: true },
        },
      },
    });

    const tracked = await Promise.all(
      products.map(async (p) => {
        if (p.variants.length > 0) {
          return {
            productId: p.id,
            sourceUrl: p.sourceUrl!,
            variants: p.variants.map((v) => ({
              variantId: v.id,
              name: v.name,
              lastKnownPriceCny: 0,
              lastKnownStock: v.stockQuantity,
            })),
          };
        }
        const full = await prisma.product.findUnique({
          where: { id: p.id },
          select: { costPriceCny: true, stockQuantity: true },
        });
        return {
          productId: p.id,
          sourceUrl: p.sourceUrl!,
          variants: [
            {
              variantId: p.id,
              name: 'default',
              lastKnownPriceCny: Number(full?.costPriceCny ?? 0),
              lastKnownStock: full?.stockQuantity ?? 0,
            },
          ],
        };
      })
    );

    res.json(tracked);
  })
);

router.patch(
  '/variants/:variantId',
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { priceCny, stock } = req.body;

    const variant = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, product: { sellerId: req.auth.sellerId } },
      include: { product: { select: { categoryId: true } } },
    });

    if (variant) {
      const rate = await productService.getCurrentExchangeRate();
      const marginPercent = await productService.getDefaultMarginForCategory(variant.product.categoryId);
      if (marginPercent == null) throw new AppError('Aucune marge configurée pour cette catégorie', 422);

      await productService.updateVariant(variant.id, req.auth.sellerId, {
        priceXof: productService.calculatePriceXof(priceCny, marginPercent, rate),
        stockQuantity: stock,
      });
      return res.status(204).send();
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.variantId, sellerId: req.auth.sellerId },
    });
    if (!product) throw new AppError('Produit ou variante non trouvé', 404);

    const rate = await productService.getCurrentExchangeRate();
    const marginPercent = await productService.getDefaultMarginForCategory(product.categoryId);
    if (marginPercent == null) throw new AppError('Aucune marge configurée pour cette catégorie', 422);

    await prisma.product.update({
      where: { id: product.id },
      data: {
        costPriceCny: priceCny,
        basePriceXof: productService.calculatePriceXof(priceCny, marginPercent, rate),
        stockQuantity: stock,
      },
    });
    res.status(204).send();
  })
);

router.post(
  '/reviews',
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { productId, reviews } = req.body;

    const product = await prisma.product.findFirst({ where: { id: productId, sellerId: req.auth.sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    await reviewService.bulkImportReviews(productId, reviews);
    res.status(204).send();
  })
);

export default router;
