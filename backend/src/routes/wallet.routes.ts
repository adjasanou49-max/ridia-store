import { Router } from 'express';
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

export default router;
