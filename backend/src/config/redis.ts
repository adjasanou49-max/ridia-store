import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

redisConnection.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

redisConnection.on('connect', () => {
  logger.info('Redis connected');
});
