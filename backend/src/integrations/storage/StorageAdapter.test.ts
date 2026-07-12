jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

describe('storageAdapter - sélection du fournisseur actif', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('utilise Cloudinary en mode mock (pas de clés configurées) quand STORAGE_PROVIDER=cloudinary', async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        STORAGE: {
          provider: 'cloudinary',
          cloudinaryCloudName: '',
          cloudinaryApiKey: '',
          cloudinaryApiSecret: '',
        },
      },
    }));
    const { storageAdapter } = await import('./StorageAdapter');

    const url = await storageAdapter.upload(Buffer.from('fake'), 'photo.jpg', 'image/jpeg');

    expect(url).toBe('https://mock-cdn.ridia-store.com/photo.jpg');
  });

  it('utilise Bunny en mode mock quand STORAGE_PROVIDER=bunny', async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        STORAGE: {
          provider: 'bunny',
          bunnyApiKey: '',
          bunnyStorageZone: '',
          bunnyPullZoneUrl: '',
        },
      },
    }));
    const { storageAdapter } = await import('./StorageAdapter');

    const url = await storageAdapter.upload(Buffer.from('fake'), 'photo.jpg', 'image/jpeg');

    expect(url).toBe('https://mock-cdn.ridia-store.com/photo.jpg');
  });

  it('utilise S3 par défaut quand aucun provider reconnu n\'est configuré', async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        STORAGE: {
          provider: 'inconnu',
          s3AccessKey: '',
          s3SecretKey: '',
          s3Bucket: 'bucket',
          s3Region: 'eu-west-1',
        },
      },
    }));
    const { storageAdapter } = await import('./StorageAdapter');

    const url = await storageAdapter.upload(Buffer.from('fake'), 'photo.jpg', 'image/jpeg');

    expect(url).toBe('https://mock-cdn.ridia-store.com/photo.jpg');
  });
});
