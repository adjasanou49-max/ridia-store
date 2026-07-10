import { Router } from 'express';
import { wishlistService } from '../services/WishlistService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await wishlistService.getWishlist(req.auth!.userId);
    res.json(items);
  })
);

// Renvoie juste les IDs produits favoris - pratique pour marquer les coeurs sur une liste
router.get(
  '/ids',
  asyncHandler(async (req, res) => {
    const ids = await wishlistService.getWishlistedProductIds(req.auth!.userId);
    res.json(ids);
  })
);

router.post(
  '/:productId/toggle',
  asyncHandler(async (req, res) => {
    const added = await wishlistService.toggle(req.auth!.userId, req.params.productId);
    res.json({ added });
  })
);

export default router;
