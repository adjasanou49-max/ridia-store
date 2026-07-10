import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

export interface ImportJobData {
  jobId: string;
  sellerId: string;
  source: string;
  rows: Array<{
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
  }>;
}

export const productImportQueue = new Queue<ImportJobData>('product-import', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});
