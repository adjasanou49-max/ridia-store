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

router.get(
  '/me/orders',
  authenticate,
  asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
    const result = await salesAgentService.getMyOrders(req.auth!.userId, page, pageSize);
    res.json(result);
  })
);

export default router;
