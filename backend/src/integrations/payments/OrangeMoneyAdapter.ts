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

  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }
    // Real implementation would call Orange's transaction status endpoint
    return { success: true, status: 'SUCCEEDED', providerTxnId };
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
      const response = await axios.post(`https://api.orange.com/orange-money-webpay/refund`, {
        order_id: providerTxnId,
        amount: amountXof,
      });
      return { success: true, raw: response.data };
    } catch (err: any) {
      logger.error('Orange Money refund error', { error: err.message });
      return { success: false };
    }
  }
}
