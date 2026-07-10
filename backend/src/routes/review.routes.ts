import { Router } from 'express';
import { reviewService } from '../services/ReviewService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const createReviewSchema = z.object({
  orderItemId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  isAnonymous: z.boolean().optional(),
});

router.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    const reviews = await reviewService.listForProduct(req.params.productId);
    res.json(reviews);
  })
);

router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = createReviewSchema.parse(req.body);
    const review = await reviewService.createOrganicReview(req.auth!.userId, data.orderItemId, data);
    res.status(201).json(review);
  })
);

export default router;
