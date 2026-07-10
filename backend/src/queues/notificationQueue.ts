import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

export interface NotificationJobData {
  userId: string;
  orderNumber?: string;
  totalXof?: number;
  trackingNumber?: string;
  [key: string]: unknown;
}

export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});
