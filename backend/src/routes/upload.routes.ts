import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { uploadRateLimiter } from '../middleware/rateLimit';
import { storageAdapter } from '../integrations/storage/StorageAdapter';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 }, // 8MB/fichier, 6 fichiers max par requête
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Seules les images sont acceptées', 422));
    }
    cb(null, true);
  },
});

router.use(authenticate, uploadRateLimiter);

// Upload d'une ou plusieurs images produit - compresse + convertit en WebP avant envoi au CDN
router.post(
  '/images',
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new AppError('Aucun fichier reçu', 422);
    }

    const urls = await Promise.all(
      files.map(async (file) => {
        const compressed = await sharp(file.buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

        const filename = `${Date.now()}.webp`;
        return storageAdapter.upload(compressed, filename, 'image/webp');
      })
    );

    res.status(201).json({ urls });
  })
);

export default router;
