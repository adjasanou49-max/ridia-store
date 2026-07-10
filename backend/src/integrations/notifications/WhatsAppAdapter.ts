import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v20.0';

export class WhatsAppAdapter {
  private get isMock() {
    return env.WHATSAPP.mode !== 'live';
  }

  async sendTextMessage(toPhone: string, message: string): Promise<{ success: boolean; messageId?: string }> {
    if (this.isMock) {
      logger.info('[WhatsApp MOCK] Sending message', { toPhone, message });
      return { success: true, messageId: `mock_${Date.now()}` };
    }

    try {
      const response = await axios.post(
        `${GRAPH_API_URL}/${env.WHATSAPP.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'text',
          text: { body: message },
        },
        { headers: { Authorization: `Bearer ${env.WHATSAPP.accessToken}` } }
      );
      return { success: true, messageId: response.data.messages?.[0]?.id };
    } catch (err: any) {
      logger.error('WhatsApp send error', { error: err.response?.data || err.message });
      return { success: false };
    }
  }

  async sendTemplateMessage(
    toPhone: string,
    templateName: string,
    languageCode: string,
    params: string[]
  ): Promise<{ success: boolean; messageId?: string }> {
    if (this.isMock) {
      logger.info('[WhatsApp MOCK] Sending template', { toPhone, templateName, params });
      return { success: true, messageId: `mock_${Date.now()}` };
    }

    try {
      const response = await axios.post(
        `${GRAPH_API_URL}/${env.WHATSAPP.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: 'body',
                parameters: params.map((p) => ({ type: 'text', text: p })),
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${env.WHATSAPP.accessToken}` } }
      );
      return { success: true, messageId: response.data.messages?.[0]?.id };
    } catch (err: any) {
      logger.error('WhatsApp template send error', { error: err.response?.data || err.message });
      return { success: false };
    }
  }
}

export const whatsAppAdapter = new WhatsAppAdapter();
