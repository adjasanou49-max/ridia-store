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
  async upload(buffer: Buffer, filename: string, _contentType?: string): Promise<string> {
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

class CloudinaryStorage {
  private get isConfigured() {
    return Boolean(env.STORAGE.cloudinaryCloudName && env.STORAGE.cloudinaryApiKey);
  }

  private async getClient() {
    // Import paresseux : évite de charger le SDK Cloudinary (et de valider sa
    // config au démarrage) quand un autre fournisseur de stockage est utilisé.
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.STORAGE.cloudinaryCloudName,
      api_key: env.STORAGE.cloudinaryApiKey,
      api_secret: env.STORAGE.cloudinaryApiSecret,
    });
    return cloudinary;
  }

  async upload(buffer: Buffer, filename: string, _contentType?: string): Promise<string> {
    if (!this.isConfigured) {
      logger.info('[Cloudinary MOCK] Upload skipped, no credentials configured', { filename });
      return `https://mock-cdn.ridia-store.com/${filename}`;
    }

    const cloudinary = await this.getClient();
    const publicId = `products/${Date.now()}-${nanoid(8)}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Échec upload Cloudinary'));
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  async delete(url: string): Promise<void> {
    if (!this.isConfigured) return;
    // L'URL Cloudinary contient le public_id entre la version (/v12345/) et
    // l'extension de fichier - on l'extrait pour pouvoir demander la suppression.
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    if (!match) {
      logger.error('Impossible d\'extraire le public_id Cloudinary pour suppression', { url });
      return;
    }
    const cloudinary = await this.getClient();
    await cloudinary.uploader.destroy(match[1]);
  }
}

const s3Storage = new S3Storage();
const bunnyStorage = new BunnyStorage();
const cloudinaryStorage = new CloudinaryStorage();

function getActiveStorage() {
  if (env.STORAGE.provider === 'bunny') return bunnyStorage;
  if (env.STORAGE.provider === 'cloudinary') return cloudinaryStorage;
  return s3Storage;
}

export const storageAdapter = {
  upload: (buffer: Buffer, filename: string, contentType: string): Promise<string> =>
    getActiveStorage().upload(buffer, filename, contentType),
  delete: (url: string): Promise<void> => getActiveStorage().delete(url),
};
