import { Router } from 'express';
import { prisma } from '../config/prisma';
import { redisConnection } from '../config/redis';
import { logger } from '../config/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authenticateViaQueryToken } from '../middleware/auth';

const router = Router();

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        channel: true,
        title: true,
        body: true,
        status: true,
        readAt: true,
        createdAt: true,
      },
    });
    res.json(notifications);
  })
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { userId: req.auth!.userId, readAt: null },
    });
    res.json({ count });
  })
);

router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.auth!.userId },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  })
);

router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  })
);

// ---------------- Flux temps réel (Server-Sent Events) ----------------
// Remplace le polling 30s : le navigateur garde une connexion HTTP ouverte,
// le serveur pousse chaque nouvelle notification dès qu'elle est créée
// (via Redis pub/sub - voir NotificationService.send). Se referme et se
// reconnecte automatiquement côté navigateur (comportement natif d'EventSource).
router.get(
  '/stream',
  authenticateViaQueryToken,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // désactive le buffering nginx pour un push immédiat
    });
    res.write(':ok\n\n'); // amorce la connexion côté client

    // Connexion Redis dédiée à cet abonnement - une connexion en mode subscribe
    // ne peut plus exécuter d'autres commandes, d'où le duplicate() isolé par client.
    const subscriber = redisConnection.duplicate();
    await subscriber.subscribe(`notifications:${userId}`);
    subscriber.on('error', (err) => logger.error('Erreur SSE Redis', { userId, error: err.message }));

    subscriber.on('message', (_channel, message) => {
      res.write(`data: ${message}\n\n`);
    });

    // Ping toutes les 25s pour garder la connexion ouverte à travers les proxys/CDN
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      subscriber.unsubscribe().catch(() => {});
      subscriber.quit().catch(() => {});
    });
  })
);

export default router;
