import { Router } from 'express';
import multer from 'multer';
import { sellerService } from '../services/SellerService';
import { productImportService } from '../services/ProductImportService';
import { orderService } from '../services/OrderService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sellerApplicationSchema, bulkImportSchema } from '../utils/validators';
import { UserRole, ImportSource } from '@prisma/client';

const router = Router();

// Fichiers CSV volumineux (catalogues de plusieurs centaines de milliers de lignes) -
// jusqu'à 200 Mo, largement suffisant même pour 1M+ produits en format CSV compact.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post(
  '/apply',
  authenticate,
  asyncHandler(async (req, res) => {
    const { storeName, storeDescription } = sellerApplicationSchema.parse(req.body);
    const seller = await sellerService.applyToBecomeSeller(req.auth!.userId, storeName, storeDescription);
    res.status(201).json(seller);
  })
);

router.get(
  '/dashboard',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const stats = await sellerService.getDashboardStats(req.auth.sellerId);
    res.json(stats);
  })
);

router.get(
  '/products',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { page, pageSize } = req.query;
    const result = await sellerService.getSellerProducts(
      req.auth.sellerId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 30
    );
    res.json(result);
  })
);

router.post(
  '/payouts',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { amountXof, method, destinationRef } = req.body;
    const payout = await sellerService.requestPayout(req.auth.sellerId, amountXof, method, destinationRef);
    res.status(201).json(payout);
  })
);

// Bulk import from 1688 / Taobao / Pinduoduo / CSV
router.post(
  '/imports',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { source, rows } = bulkImportSchema.parse(req.body);
    const job = await productImportService.startBulkImport(req.auth.sellerId, source as any, rows);
    res.status(202).json(job);
  })
);

// Import CSV pour les très gros catalogues (centaines de milliers à millions de produits) -
// découpé automatiquement en lots de 1000, traité en arrière-plan.
router.post(
  '/imports/csv',
  authenticate,
  authorize(UserRole.SELLER),
  csvUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    if (!req.file) throw new AppError('Fichier CSV requis', 422);

    const source = (req.body.source as ImportSource) || ImportSource.CSV_UPLOAD;
    const result = await productImportService.startBulkImportFromCsv(req.auth.sellerId, source, req.file.buffer, {
      categoryId: req.body.categoryId || undefined,
      marginPercent: req.body.marginPercent ? Number(req.body.marginPercent) : undefined,
      sourceLanguage: req.body.sourceLanguage || undefined,
    });
    res.status(202).json(result);
  })
);

router.get(
  '/imports/:jobId',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    const job = await productImportService.getImportJobStatus(req.params.jobId, req.auth!.sellerId!);
    res.json(job);
  })
);

router.get(
  '/imports',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const jobs = await productImportService.getSellerImportJobs(req.auth.sellerId);
    res.json(jobs);
  })
);

// ---------------- Commandes du vendeur ----------------
router.get(
  '/orders',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { page, pageSize } = req.query;
    const result = await orderService.getSellerOrderItems(
      req.auth.sellerId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 30
    );
    res.json(result);
  })
);

router.patch(
  '/orders/:orderItemId/ship',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { trackingNumber } = req.body;
    if (!trackingNumber) throw new AppError('Numéro de suivi requis', 422);
    const item = await orderService.shipOrderItem(req.params.orderItemId, req.auth.sellerId, trackingNumber);
    res.json(item);
  })
);

// ---------------- Personnalisation boutique ----------------
router.get(
  '/store',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const seller = await sellerService.getStoreProfile(req.auth.sellerId);
    res.json(seller);
  })
);

router.patch(
  '/store',
  authenticate,
  authorize(UserRole.SELLER),
  asyncHandler(async (req, res) => {
    if (!req.auth?.sellerId) throw new AppError('Compte vendeur requis', 403);
    const { storeName, storeDescription, storeLogoUrl, storeBannerUrl } = req.body;
    const seller = await sellerService.updateStoreProfile(req.auth.sellerId, {
      storeName,
      storeDescription,
      storeLogoUrl,
      storeBannerUrl,
    });
    res.json(seller);
  })
);

export default router;
