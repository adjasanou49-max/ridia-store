import { Router } from 'express';
import { z } from 'zod';
import { walletService } from '../services/WalletService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [balanceXof, transactions] = await Promise.all([
      walletService.getBalance(req.auth!.userId),
      walletService.getHistory(req.auth!.userId),
    ]);
    res.json({ balanceXof, transactions });
  })
);

const topUpSchema = z.object({
  amountXof: z.number().positive(),
  provider: z.enum(['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'CUSTOM']),
  phone: z.string().min(8),
  name: z.string().min(2),
});

router.post(
  '/topup',
  asyncHandler(async (req, res) => {
    const data = topUpSchema.parse(req.body);
    const result = await walletService.initiateTopUp(
      req.auth!.userId,
      data.amountXof,
      data.provider as any,
      data.phone,
      data.name
    );
    res.status(201).json(result);
  })
);

export default router;
