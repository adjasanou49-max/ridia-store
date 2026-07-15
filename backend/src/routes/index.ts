import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import orderRoutes from './order.routes';
import sellerRoutes from './seller.routes';
import adminRoutes from './admin.routes';
import webhookRoutes from './webhook.routes';
import wishlistRoutes from './wishlist.routes';
import addressRoutes from './address.routes';
import uploadRoutes from './upload.routes';
import reviewRoutes from './review.routes';
import notificationRoutes from './notification.routes';
import scrapeImportRoutes from './scrapeImport.routes';
import orderFulfillmentRoutes from './orderFulfillment.routes';
import walletRoutes from './wallet.routes';
import supportRoutes from './support.routes';
import salesAgentRoutes from './sales-agent.routes';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/seller', sellerRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/addresses', addressRoutes);
router.use('/upload', uploadRoutes);
router.use('/reviews', reviewRoutes);
router.use('/notifications', notificationRoutes);
router.use('/scrape-import', scrapeImportRoutes);
router.use('/order-fulfillment', orderFulfillmentRoutes);
router.use('/wallet', walletRoutes);
router.use('/support', supportRoutes);
router.use('/sales-agent', salesAgentRoutes);

export default router;
