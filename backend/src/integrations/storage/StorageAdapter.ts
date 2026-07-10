import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { nanoid } from 'nanoid';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

class S3Storage {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.STORAGE.s3Region,
      credentials: {
        accessKeyId: env.STORAGE.s3AccessKey || 'mock',
        secretAccessKey: env.STORAGE.s3SecretKey || 'mock',
      },
    });
  }

  async upload(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    if (!env.STORAGE.s3AccessKey) {
      logger.info('[S3 MOCK] Upload skipped, no credentials configured', { filename });
      return `https://mock-cdn.ridia-store.com/${filename}`;
    }

    const key = `products/${Date.now()}-${nanoid(8)}-${filename}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.STORAGE.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `https://${env.STORAGE.s3Bucket}.s3.${env.STORAGE.s3Region}.amazonaws.com/${key}`;
  }

  async delete(url: string): Promise<void> {
    if (!env.STORAGE.s3AccessKey) return;
    const key = url.split('.amazonaws.com/')[1];
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: env.STORAGE.s3Bucket, Key: key }));
  }
}

class BunnyStorage {
  async upload(buffer: Buffer, filename: string): Promise<string> {
    if (!env.STORAGE.bunnyApiKey) {
      logger.info('[Bunny MOCK] Upload skipped, no credentials configured', { filename });
      return `https://mock-cdn.ridia-store.com/${filename}`;
    }

    const path = `products/${Date.now()}-${nanoid(8)}-${filename}`;
    await axios.put(
      `https://storage.bunnycdn.com/${env.STORAGE.bunnyStorageZone}/${path}`,
      buffer,
      { headers: { AccessKey: env.STORAGE.bunnyApiKey, 'Content-Type': 'application/octet-stream' } }
    );
    return `${env.STORAGE.bunnyPullZoneUrl}/${path}`;
  }

  async delete(url: string): Promise<void> {
    if (!env.STORAGE.bunnyApiKey) return;
    const path = url.replace(env.STORAGE.bunnyPullZoneUrl, '');
    await axios.delete(`https://storage.bunnycdn.com/${env.STORAGE.bunnyStorageZone}${path}`, {
      headers: { AccessKey: env.STORAGE.bunnyApiKey },
    });
  }
}

const s3Storage = new S3Storage();
const bunnyStorage = new BunnyStorage();

export const storageAdapter = {
  upload: (buffer: Buffer, filename: string, contentType: string): Promise<string> =>
    env.STORAGE.provider === 'bunny'
      ? bunnyStorage.upload(buffer, filename)
      : s3Storage.upload(buffer, filename, contentType),
  delete: (url: string): Promise<void> =>
    env.STORAGE.provider === 'bunny' ? bunnyStorage.delete(url) : s3Storage.delete(url),
};
