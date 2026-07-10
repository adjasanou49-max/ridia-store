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

const WAVE_BASE_URL = 'https://api.wave.com/v1';

export class WaveAdapter implements PaymentAdapter {
  readonly providerName = 'WAVE';

  private get isMock() {
    return env.WAVE.mode !== 'live';
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const transactionId = `RID-WAVE-${params.orderId}-${nanoid(6)}`;

    if (this.isMock) {
      logger.info('[Wave MOCK] Initiating payment', { transactionId, amount: params.amountXof });
      return {
        success: true,
        providerTxnId: transactionId,
        paymentUrl: `${env.FRONTEND_URL}/payment/mock?provider=wave&txn=${transactionId}`,
      };
    }

    try {
      const response = await axios.post(
        `${WAVE_BASE_URL}/checkout/sessions`,
        {
          amount: Math.round(params.amountXof),
          currency: 'XOF',
          error_url: `${env.FRONTEND_URL}/payment/error`,
          success_url: `${env.FRONTEND_URL}/orders/${params.orderId}`,
          client_reference: transactionId,
        },
        { headers: { Authorization: `Bearer ${env.WAVE.apiKey}` } }
      );

      return {
        success: true,
        providerTxnId: transactionId,
        paymentUrl: response.data.wave_launch_url,
        raw: response.data,
      };
    } catch (err: any) {
      logger.error('Wave initiate error', { error: err.message });
      return { success: false, providerTxnId: transactionId };
    }
  }

  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }

    try {
      const response = await axios.get(
        `${WAVE_BASE_URL}/checkout/sessions?client_reference=${providerTxnId}`,
        { headers: { Authorization: `Bearer ${env.WAVE.apiKey}` } }
      );
      const status = response.data.payment_status;
      return {
        success: status === 'succeeded',
        status: status === 'succeeded' ? 'SUCCEEDED' : status === 'failed' ? 'FAILED' : 'PENDING',
        providerTxnId,
        raw: response.data,
      };
    } catch (err: any) {
      logger.error('Wave verify error', { error: err.message });
      return { success: false, status: 'FAILED', providerTxnId };
    }
  }

  async handleWebhook(payload: any): Promise<VerifyPaymentResult> {
    const providerTxnId = payload.client_reference;
    return this.verifyPayment(providerTxnId);
  }

  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (this.isMock) {
      logger.info('[Wave MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }
    try {
      const response = await axios.post(
        `https://api.wave.com/v1/checkout/sessions/${providerTxnId}/refund`,
        {},
        { headers: { Authorization: `Bearer ${env.WAVE.apiKey}` } }
      );
      return { success: true, raw: response.data };
    } catch (err: any) {
      logger.error('Wave refund error', { error: err.message });
      return { success: false };
    }
  }
}
