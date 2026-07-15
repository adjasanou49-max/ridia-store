import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { salesAgentService } from '../services/SalesAgentService';

const router = Router();

router.get(
  '/me/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const stats = await salesAgentService.getMyStats(req.auth!.userId);
    res.json(stats);
  })
);

export default router;
