import { ImportSource, ImportJobStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { prisma } from '../config/prisma';
import { productImportQueue } from '../queues/productImportQueue';
import { AppError } from '../middleware/errorHandler';

interface ManualImportRow {
  url: string;
  name: string;
  description?: string;
  priceCny: number;
  moq?: number;
  images?: string[];
  videoUrl?: string;
  sourceLanguage?: string;
  weight?: number;
  categoryId?: string; // si absent, l'agent IA suggère automatiquement
  stockQuantity: number;
  marginPercent?: number;
  reviews?: Array<{ authorName: string; rating: number; comment?: string }>;
}

export class ProductImportService {
  /** Start a bulk import job (CSV rows already parsed) */
  async startBulkImport(
    sellerId: string,
    source: ImportSource,
    rows: ManualImportRow[]
  ) {
    const connector = await prisma.sellerConnector.upsert({
      where: { id: `${sellerId}-${source}` },
      create: { id: `${sellerId}-${source}`, sellerId, source, isActive: true },
      update: { lastSyncAt: new Date() },
    });

    const job = await prisma.importJob.create({
      data: {
        connectorId: connector.id,
        source,
        status: ImportJobStatus.QUEUED,
        totalItems: rows.length,
      },
    });

    // Push to BullMQ for async processing (handles 50K-500K rows without blocking API)
    await productImportQueue.add('bulk-import', {
      jobId: job.id,
      sellerId,
      source,
      rows,
    });

    return job;
  }

  /**
   * Correction faille IDOR : rien ne vérifiait que le job consulté appartient
   * bien au vendeur authentifié - n'importe quel vendeur pouvait consulter le
   * statut d'import (et le détail des erreurs) d'un autre vendeur en devinant
   * son jobId.
   */
  async getImportJobStatus(jobId: string, sellerId: string) {
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, connector: { sellerId } },
    });
    if (!job) throw new AppError('Job d\'import non trouvé', 404);
    return job;
  }

  async getSellerImportJobs(sellerId: string) {
    return prisma.importJob.findMany({
      where: { connector: { sellerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Import depuis un fichier CSV, avec découpage automatique en lots de 1000 lignes.
   * Un seul upload peut ainsi contenir des centaines de milliers, voire des millions de
   * produits : le service crée plusieurs ImportJob en arrière-plan (un par lot de 1000),
   * chacun traité indépendamment par le worker - jamais de blocage de la requête HTTP.
   *
   * Colonnes attendues (en-tête requis) : name,description,priceCny,stockQuantity,url,
   * videoUrl,weight,categoryId,marginPercent,sourceLanguage,images
   * (images = URLs séparées par des "|" dans la cellule)
   */
  async startBulkImportFromCsv(
    sellerId: string,
    source: ImportSource,
    csvBuffer: Buffer,
    defaults: { categoryId?: string; marginPercent?: number; sourceLanguage?: string }
  ) {
    const records: Record<string, string>[] = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      throw new AppError('Le fichier CSV est vide ou mal formaté', 422);
    }

    const rows: ManualImportRow[] = records.map((r) => ({
      url: r.url || '',
      name: r.name || 'Produit sans nom',
      description: r.description || undefined,
      priceCny: Number(r.priceCny) || 0,
      stockQuantity: Number(r.stockQuantity) || 0,
      videoUrl: r.videoUrl || undefined,
      weight: r.weight ? Number(r.weight) : undefined,
      categoryId: r.categoryId || defaults.categoryId,
      marginPercent: r.marginPercent ? Number(r.marginPercent) : defaults.marginPercent,
      sourceLanguage: r.sourceLanguage || defaults.sourceLanguage,
      images: r.images ? r.images.split('|').map((s) => s.trim()).filter(Boolean) : undefined,
    }));

    // Découpage en lots de 1000 - chaque lot devient un ImportJob traité indépendamment
    const CHUNK_SIZE = 1000;
    const jobs = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      jobs.push(await this.startBulkImport(sellerId, source, chunk));
    }

    return { totalRows: rows.length, jobCount: jobs.length, jobIds: jobs.map((j) => j.id) };
  }
}

export const productImportService = new ProductImportService();
