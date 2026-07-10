import { Router } from 'express';
import { addressService } from '../services/AddressService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { addressSchema } from '../utils/validators';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const addresses = await addressService.listForUser(req.auth!.userId);
    res.json(addresses);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = addressSchema.parse(req.body);
    const address = await addressService.create(req.auth!.userId, data);
    res.status(201).json(address);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = addressSchema.partial().parse(req.body);
    const address = await addressService.update(req.auth!.userId, req.params.id, data);
    res.json(address);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await addressService.remove(req.auth!.userId, req.params.id);
    res.status(204).send();
  })
);

export default router;
