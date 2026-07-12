import { Router } from 'express';
import { orderService } from '../services/OrderService';
import { couponService } from '../services/CouponService';
import { disputeService } from '../services/DisputeService';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { addToCartSchema, createOrderSchema, createDisputeSchema } from '../utils/validators';

const router = Router();

router.use(authenticate);

// ---------------- Cart ----------------
router.get(
  '/cart',
  asyncHandler(async (req, res) => {
    const cart = await orderService.getCart(req.auth!.userId);
    res.json(cart);
  })
);

router.post(
  '/cart',
  asyncHandler(async (req, res) => {
    const { productId, variantId, quantity } = addToCartSchema.parse(req.body);
    const item = await orderService.addToCart(req.auth!.userId, productId, quantity, variantId);
    res.status(201).json(item);
  })
);

router.delete(
  '/cart/:itemId',
  asyncHandler(async (req, res) => {
    await orderService.removeCartItem(req.auth!.userId, req.params.itemId);
    res.status(204).send();
  })
);

// ---------------- Orders ----------------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createOrderSchema.parse(req.body);
    const result = await orderService.createOrderFromCart(
      req.auth!.userId,
      data.shippingAddressId,
      data.paymentProvider as any,
      data.customerPhone,
      data.customerName,
      data.couponCode,
      data.pointsToRedeem,
      data.walletAmountToUse
    );
    res.status(201).json(result);
  })
);

// Vérifie un code promo avant de finaliser la commande (checkout affiche la remise en direct)
router.post(
  '/validate-coupon',
  asyncHandler(async (req, res) => {
    const { code, subtotalXof } = req.body;
    const result = await couponService.validate(code, req.auth!.userId, Number(subtotalXof));
    res.json({ discountXof: result.discountXof });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query;
    const result = await orderService.getUserOrders(
      req.auth!.userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20
    );
    res.json(result);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.params.id, req.auth!.userId);
    res.json(order);
  })
);

// Annulation par le client - possible seulement avant expédition
router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    await orderService.cancelOrder(req.params.id, req.auth!.userId, req.body?.reason);
    res.status(204).send();
  })
);

// ---------------- Litiges ----------------
router.post(
  '/disputes',
  asyncHandler(async (req, res) => {
    const data = createDisputeSchema.parse(req.body);
    const dispute = await disputeService.createDispute(req.auth!.userId, data.orderId, data);
    res.status(201).json(dispute);
  })
);

router.get(
  '/disputes/mine',
  asyncHandler(async (req, res) => {
    const disputes = await disputeService.getUserDisputes(req.auth!.userId);
    res.json(disputes);
  })
);

export default router;
