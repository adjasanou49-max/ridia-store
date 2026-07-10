import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { supplierFulfillmentService } from '../services/SupplierFulfillmentService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Accessible à l'agent d'achat ET aux admins/super-admin (pour supervision),
// mais un agent d'achat n'a accès à AUCUNE autre route admin - c'est la
// seule chose que ce rôle peut voir dans toute l'application.
router.use(authenticate, authorize(UserRole.PURCHASING_AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await supplierFulfillmentService.listPendingFulfillment();
    res.json(items);
  })
);

router.post(
  '/:orderItemId/mark-ordered',
  asyncHandler(async (req, res) => {
    const { supplierOrderRef } = req.body;
    await supplierFulfillmentService.markAsOrdered(req.params.orderItemId, req.auth!.userId, supplierOrderRef);
    res.status(204).send();
  })
);

export default router;
