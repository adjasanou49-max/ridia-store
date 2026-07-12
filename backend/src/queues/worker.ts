import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { productService } from '../services/ProductService';
import { reviewService } from '../services/ReviewService';
import { categorySuggestionAgent } from '../integrations/ai/CategorySuggestionAgent';
import { notificationService } from '../services/NotificationService';
import { ImportJobData } from './productImportQueue';
import { NotificationJobData } from './notificationQueue';
import { ImportJobStatus, ProductStatus } from '@prisma/client';

// ---------------- Product Import Worker ----------------
const importWorker = new Worker<ImportJobData>(
  'product-import',
  async (job: Job<ImportJobData>) => {
    const { jobId, sellerId, rows } = job.data;

    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportJobStatus.RUNNING, startedAt: new Date() },
    });

    // Chargée une seule fois pour tout le job (pas à chaque ligne) - évite de spammer
    // l'agent IA / la base pour rien quand la plupart des lignes ont déjà une catégorie.
    const needsAutoCategory = rows.some((r) => !r.categoryId);
    const availableCategories = needsAutoCategory
      ? await prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } })
      : [];

    let success = 0;
    let failed = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Agent IA : devine la catégorie quand le fournisseur (1688/Taobao/Pinduoduo)
        // n'en donne pas une exploitable directement.
        const categoryId =
          row.categoryId ??
          (await categorySuggestionAgent.suggestCategory(row.name, row.description || '', availableCategories))
            .categoryId;

        const product = await productService.createProduct({
          sellerId,
          categoryId,
          name: row.name,
          description: row.description || row.name,
          costPriceCny: row.priceCny,
          // Pas de "?? 80" ici : si absent, ProductService retombe sur la marge de la
          // catégorie (réglée par le SUPER_ADMIN), puis la marge système par défaut.
          // Si aucune des deux n'est configurée, la création échoue explicitement
          // (pas de secours arbitraire) - voir ProductService.getDefaultMarginForCategory.
          marginPercent: row.marginPercent,
          stockQuantity: row.stockQuantity,
          images: row.images || [],
          videoUrl: row.videoUrl,
          weight: row.weight,
          sourceLanguage: row.sourceLanguage ?? 'zh', // 1688/Taobao/Pinduoduo = chinois par défaut
        });

        // Avis importés du fournisseur (si fournis dans la ligne d'import)
        if (row.reviews?.length) {
          await reviewService.bulkImportReviews(product.id, row.reviews);
        }

        // Auto-publish imported products (can be changed to PENDING_REVIEW for manual QC)
        await prisma.product.update({
          where: { id: product.id },
          data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
        });

        success++;
      } catch (err: any) {
        failed++;
        errors.push({ row: i, error: err.message });
        logger.error('Import row failed', { row: i, error: err.message });
      }

      // Update progress every 50 items to avoid excessive DB writes
      if (i % 50 === 0 || i === rows.length - 1) {
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedItems: i + 1, successItems: success, failedItems: failed, cursor: String(i) },
        });
        await job.updateProgress(Math.round(((i + 1) / rows.length) * 100));
      }
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: failed === 0 ? ImportJobStatus.COMPLETED : ImportJobStatus.PARTIALLY_COMPLETED,
        completedAt: new Date(),
        processedItems: rows.length,
        successItems: success,
        failedItems: failed,
        errorLog: errors.length ? (errors as any) : undefined,
      },
    });

    logger.info('Import job completed', { jobId, success, failed });
  },
  { connection: redisConnection, concurrency: env.IMPORT_WORKER_CONCURRENCY }
);

importWorker.on('failed', (job, err) => {
  logger.error('Import worker job failed', { jobId: job?.id, error: err.message });
});

// ---------------- Notification Worker ----------------
const notificationWorker = new Worker<NotificationJobData>(
  'notifications',
  async (job: Job<NotificationJobData>) => {
    const { name, data } = job;

    switch (name) {
      case 'order-confirmed':
        await notificationService.notifyOrderConfirmed(
          data.userId,
          data.orderNumber!,
          data.totalXof!
        );
        break;
      case 'order-shipped':
        await notificationService.notifyOrderShipped(
          data.userId,
          data.orderNumber!,
          data.trackingNumber!
        );
        break;
      case 'order-review-request':
        await notificationService.notifyReviewRequest(data.userId, data.orderNumber!);
        break;
      default:
        logger.warn('Unknown notification job type', { name });
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

notificationWorker.on('failed', (job, err) => {
  logger.error('Notification worker job failed', { jobId: job?.id, error: err.message });
});

// ---------------- Application des hausses de prix programmées ----------------
// Vérifie toutes les 60s si des produits ont atteint leur date de hausse de prix
// (urgence client style Temu/Pinduoduo) et applique le nouveau prix automatiquement.
setInterval(async () => {
  try {
    const count = await productService.applyDuePriceIncreases();
    if (count > 0) logger.info(`Hausses de prix appliquées: ${count} produit(s)`);
  } catch (err: any) {
    logger.error('Erreur application hausses de prix', { error: err.message });
  }
}, 60_000);

logger.info('🔄 Workers started: product-import, notifications');
