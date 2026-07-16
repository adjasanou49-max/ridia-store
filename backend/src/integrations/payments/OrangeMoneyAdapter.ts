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
   * Vérification réelle via l'API "Transaction Status" d'Orange Money.
   *
   * ⚠️ Endpoint déduit par recoupement de plusieurs SDK tiers indépendants
   * (om4j en Java, Foris-master/orange-money-sdk en PHP, Ibracilinks/OrangeMoney
   * en PHP/Laravel) qui décrivent tous la même requête et la même réponse -
   * je n'ai pas pu accéder à la référence officielle d'Orange (portail
   * développeur fermé derrière un compte). À tester en sandbox Orange avant
   * la mise en production réelle - si l'appel échoue ou renvoie un format
   * inattendu, on retombe sur PENDING (jamais de fausse confirmation), donc
   * aucun risque de sécurité même si l'implémentation doit être ajustée.
   */
  async verifyPayment(providerTxnId: string, metadata?: unknown): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }

    const meta = metadata as { payToken?: string; amountXof?: number } | undefined;
    const payToken = meta?.payToken;
    if (!payToken) {
      logger.warn('Orange Money verifyPayment appelé sans payToken en metadata - impossible de vérifier', {
        providerTxnId,
      });
      return { success: false, status: 'PENDING', providerTxnId };
    }

    try {
      const token = await this.getAccessToken();
      // order_id ici = providerTxnId (notre transactionId "RID-OM-...", voir
      // initiatePayment) - c'est bien ce qu'on a envoyé comme order_id à
      // Orange à l'initiation, donc ce qu'ils attendent en retour.
      const response = await axios.post(
        `${ORANGE_BASE_URL}/transactionstatus`,
        { order_id: providerTxnId, amount: Math.round(meta?.amountXof ?? 0), pay_token: payToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const status = response.data?.status;
      if (status === 'SUCCESS') {
        return { success: true, status: 'SUCCEEDED', providerTxnId, raw: response.data };
      }
      if (status === 'FAILED' || status === 'EXPIRED') {
        return { success: true, status: 'FAILED', providerTxnId, raw: response.data };
      }
      // INITIATED / PENDING / valeur inconnue -> toujours en attente, jamais confirmé.
      return { success: false, status: 'PENDING', providerTxnId, raw: response.data };
    } catch (err: any) {
      logger.error('Orange Money verifyPayment error - commande laissée en attente par sécurité', {
        providerTxnId,
        error: err.message,
      });
      return { success: false, status: 'PENDING', providerTxnId };
    }
  }

  async handleWebhook(payload: any): Promise<VerifyPaymentResult> {
    const providerTxnId = payload.order_id;
    return this.verifyPayment(providerTxnId, { payToken: payload.pay_token, amountXof: payload.amount });
  }

  /**
   * Remboursement automatique désactivé temporairement en mode réel : comme
   * pour verifyPayment, l'intégration Orange Money n'a jamais été testée en
   * conditions réelles - mieux vaut échouer proprement ici (le remboursement
   * sera alors traité manuellement, voir le log d'erreur remonté dans
   * OrderService.cancelOrder / DisputeService.triggerRefund) que de tenter un
   * appel non fiable qui pourrait échouer silencieusement ou mal fonctionner
   * avec de l'argent réel.
   */
  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (this.isMock) {
      logger.info('[Orange Money MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }
    logger.warn(
      'Remboursement automatique Orange Money désactivé (intégration non finalisée) - traitement manuel requis',
      { providerTxnId, amountXof }
    );
    return { success: false };
  }
}
