import axios from 'axios';
import { nanoid } from 'nanoid';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  PaymentAdapter,
  InitiatePaymentParams,
  InitiatePaymentResult,
  VerifyPaymentResult,
  RefundResult,
} from './PaymentAdapter';

// Orange Money Web Payment API (OAuth2 + payment request)
const ORANGE_BASE_URL = 'https://api.orange.com/orange-money-webpay/dev/v1';

export class OrangeMoneyAdapter implements PaymentAdapter {
  readonly providerName = 'ORANGE_MONEY';

  private get isMock() {
    return env.ORANGE_MONEY.mode !== 'live';
  }

  private async getAccessToken(): Promise<string> {
    const creds = Buffer.from(
      `${env.ORANGE_MONEY.clientId}:${env.ORANGE_MONEY.clientSecret}`
    ).toString('base64');
    const response = await axios.post(
      'https://api.orange.com/oauth/v3/token',
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const transactionId = `RID-OM-${params.orderId}-${nanoid(6)}`;

    if (this.isMock) {
      logger.info('[OrangeMoney MOCK] Initiating payment', { transactionId, amount: params.amountXof });
      return {
        success: true,
        providerTxnId: transactionId,
        paymentUrl: `${env.FRONTEND_URL}/payment/mock?provider=orange&txn=${transactionId}`,
      };
    }

    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${ORANGE_BASE_URL}/webpayment`,
        {
          merchant_key: env.ORANGE_MONEY.clientId,
          currency: 'XOF',
          order_id: transactionId,
          amount: Math.round(params.amountXof),
          return_url: `${env.FRONTEND_URL}/orders/${params.orderId}`,
          cancel_url: `${env.FRONTEND_URL}/payment/error`,
          notif_url: `${env.API_BASE_URL}/api/v1/webhooks/orange-money`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return {
        success: true,
        providerTxnId: transactionId,
        paymentUrl: response.data.payment_url,
        raw: response.data,
      };
    } catch (err: any) {
      logger.error('Orange Money initiate error', { error: err.message });
      return { success: false, providerTxnId: transactionId };
    }
  }

  /**
   * ⚠️ CORRECTION FAILLE CRITIQUE : cette méthode renvoyait auparavant
   * toujours `SUCCEEDED` en mode réel (hors mock), sans jamais interroger
   * Orange - l'intégration réelle n'a jamais été terminée. N'importe qui
   * pouvait donc faire confirmer une commande gratuitement en initiant un
   * paiement puis en laissant le webhook (ou une requête forgée) déclencher
   * la confirmation, sans jamais payer réellement.
   *
   * En attendant une vraie intégration testée avec l'API Orange (endpoint de
   * statut de transaction), on renvoie PENDING en mode réel : la commande
   * reste non confirmée plutôt que d'être confirmée à tort. C'est moins
   * pratique (confirmation manuelle nécessaire pour l'instant) mais
   * infiniment plus sûr qu'un contournement de paiement.
   */
  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }
    logger.warn(
      "Vérification Orange Money non implémentée en mode réel - paiement laissé en attente, ne jamais confirmer sans vraie vérification",
      { providerTxnId }
    );
    return { success: false, status: 'PENDING', providerTxnId };
  }

  async handleWebhook(payload: any): Promise<VerifyPaymentResult> {
    const providerTxnId = payload.order_id;
    return this.verifyPayment(providerTxnId);
  }

  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (this.isMock) {
      logger.info('[Orange Money MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }
    try {
      // Correction bug : le jeton d'authentification manquait ici (présent
      // sur initiatePayment mais oublié sur ce remboursement) - la requête
      // aurait systématiquement échoué avec une erreur 401 en production.
      const token = await this.getAccessToken();
      const response = await axios.post(
        `https://api.orange.com/orange-money-webpay/refund`,
        { order_id: providerTxnId, amount: amountXof },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { success: true, raw: response.data };
    } catch (err: any) {
      logger.error('Orange Money refund error', { error: err.message });
      return { success: false };
    }
  }
}
