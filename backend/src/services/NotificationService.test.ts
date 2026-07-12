jest.mock('../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));
jest.mock('../config/redis', () => ({
  redisConnection: { publish: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../integrations/notifications/WhatsAppAdapter', () => ({
  whatsAppAdapter: { sendTextMessage: jest.fn().mockResolvedValue({ success: true }) },
}));
jest.mock('../integrations/notifications/SendGridAdapter', () => ({
  sendGridAdapter: {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendShippingNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from '../config/prisma';
import { sendGridAdapter } from '../integrations/notifications/SendGridAdapter';
import { whatsAppAdapter } from '../integrations/notifications/WhatsAppAdapter';
import { NotificationService } from './NotificationService';

const mockedPrisma = prisma as unknown as { user: { findUnique: jest.Mock } };
const mockedSendGrid = sendGridAdapter as unknown as {
  sendShippingNotification: jest.Mock;
  sendOrderConfirmation: jest.Mock;
};
const mockedWhatsApp = whatsAppAdapter as unknown as { sendTextMessage: jest.Mock };

describe('NotificationService.notifyOrderShipped', () => {
  const service = new NotificationService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envoie WhatsApp ET email quand le client a un numéro de téléphone', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'ria@test.com',
      phone: '+22670000000',
    });

    await service.notifyOrderShipped('u1', 'RID-2026-ABC', 'TRACK123');

    expect(mockedWhatsApp.sendTextMessage).toHaveBeenCalled();
    expect(mockedSendGrid.sendShippingNotification).toHaveBeenCalledWith(
      'ria@test.com',
      'RID-2026-ABC',
      'TRACK123'
    );
  });

  it("envoie quand même l'email si le client n'a pas de numéro de téléphone (avant : aucune notification n'était envoyée du tout)", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'sansphone@test.com',
      phone: null,
    });

    await service.notifyOrderShipped('u2', 'RID-2026-XYZ', 'TRACK456');

    expect(mockedWhatsApp.sendTextMessage).not.toHaveBeenCalled();
    expect(mockedSendGrid.sendShippingNotification).toHaveBeenCalledWith(
      'sansphone@test.com',
      'RID-2026-XYZ',
      'TRACK456'
    );
  });

  it("ne fait rien si l'utilisateur n'existe pas (compte supprimé entre-temps)", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    await service.notifyOrderShipped('u-inconnu', 'RID-2026-AAA', 'TRACK789');

    expect(mockedWhatsApp.sendTextMessage).not.toHaveBeenCalled();
    expect(mockedSendGrid.sendShippingNotification).not.toHaveBeenCalled();
  });
});
