import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { redisConnection } from '../config/redis';
import { whatsAppAdapter } from '../integrations/notifications/WhatsAppAdapter';
import { sendGridAdapter } from '../integrations/notifications/SendGridAdapter';
import { logger } from '../config/logger';

export class NotificationService {
  async notifyOrderConfirmed(userId: string, orderNumber: string, totalXof: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const message = `Bonjour ${user.firstName}! Votre commande ${orderNumber} a été confirmée. Total: ${totalXof.toLocaleString('fr-FR')} FCFA. Merci de votre confiance sur Ridia Store!`;

    if (user.phone) {
      await this.send(userId, NotificationChannel.WHATSAPP, 'Commande confirmée', message, {
        phone: user.phone,
      });
    }

    await sendGridAdapter.sendOrderConfirmation(user.email, orderNumber, totalXof);
  }

  async notifyOrderShipped(userId: string, orderNumber: string, trackingNumber: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const message = `Votre commande ${orderNumber} a été expédiée! Numéro de suivi: ${trackingNumber}`;
    if (user.phone) {
      await this.send(userId, NotificationChannel.WHATSAPP, 'Commande expédiée', message, {
        phone: user.phone,
      });
    }

    // Envoyé systématiquement en plus du WhatsApp - un client sans numéro
    // enregistré (ou qui ne consulte pas WhatsApp) ne doit jamais rater
    // cette notification faute d'avoir un seul canal de secours.
    await sendGridAdapter.sendShippingNotification(user.email, orderNumber, trackingNumber);
  }

  /**
   * Demande d'avis envoyée 3 jours après la livraison (voir
   * OrderService.updateOrderStatus). Silencieuse si le compte a été
   * supprimé/anonymisé entre-temps (RGPD - voir AuthService.requestAccountDeletion).
   */
  async notifyReviewRequest(userId: string, orderNumber: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return;

    if (user.phone) {
      const message = `Comment s'est passée ta commande ${orderNumber} ? Laisse un avis pour aider les autres clients 🌟`;
      await this.send(userId, NotificationChannel.WHATSAPP, 'Ton avis compte', message, {
        phone: user.phone,
      });
    }

    await sendGridAdapter.sendReviewRequest(user.email, orderNumber);
  }

  async notifyLowStock(sellerId: string, productName: string, remainingStock: number) {
    const seller = await prisma.seller.findUnique({ where: { id: sellerId }, include: { user: true } });
    if (!seller?.user.phone) return;

    const message = `⚠️ Stock faible: "${productName}" - il reste ${remainingStock} unités.`;
    await this.send(seller.userId, NotificationChannel.WHATSAPP, 'Alerte stock', message, {
      phone: seller.user.phone,
    });
  }

  private async send(
    userId: string,
    channel: NotificationChannel,
    title: string,
    body: string,
    meta: { phone?: string }
  ) {
    const notification = await prisma.notification.create({
      data: { userId, channel, title, body, status: NotificationStatus.QUEUED },
    });

    // Publié sur Redis pour que le flux SSE (notifications en temps réel) pousse
    // immédiatement la notification au client connecté, sans attendre le polling.
    redisConnection
      .publish(`notifications:${userId}`, JSON.stringify(notification))
      .catch((err) => logger.error('Erreur publication notification temps réel', { error: err.message }));

    try {
      let result: { success: boolean };
      if (channel === NotificationChannel.WHATSAPP && meta.phone) {
        result = await whatsAppAdapter.sendTextMessage(meta.phone, body);
      } else {
        result = { success: false };
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
          sentAt: result.success ? new Date() : undefined,
        },
      });
    } catch (err: any) {
      logger.error('Notification send failed', { error: err.message, notificationId: notification.id });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, failReason: err.message },
      });
    }
  }
}

export const notificationService = new NotificationService();
