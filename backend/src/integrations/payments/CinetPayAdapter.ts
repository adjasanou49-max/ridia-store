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

const CINETPAY_BASE_URL = 'https://api-checkout.cinetpay.com/v2';

export class CinetPayAdapter implements PaymentAdapter {
  readonly providerName = 'CINETPAY';

  private get isMock() {
    return env.CINETPAY.mode !== 'live';
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const transactionId = `RID-${params.orderId}-${nanoid(6)}`;

    if (this.isMock) {
      logger.info('[CinetPay MOCK] Initiating payment', { transactionId, amount: params.amountXof });
      return {
        success: true,
        providerTxnId: transactionId,
        paymentUrl: `${env.FRONTEND_URL}/payment/mock?provider=cinetpay&txn=${transactionId}`,
      };
    }

    try {
      const response = await axios.post(`${CINETPAY_BASE_URL}/payment`, {
        apikey: env.CINETPAY.apiKey,
        site_id: env.CINETPAY.siteId,
        transaction_id: transactionId,
        amount: Math.round(params.amountXof),
        currency: 'XOF',
        description: params.description,
        customer_name: params.customerName,
        customer_phone_number: params.customerPhone,
        notify_url: `${env.API_BASE_URL}/api/v1/webhooks/cinetpay`,
        return_url: `${env.FRONTEND_URL}/orders/${params.orderId}`,
        channels: 'ALL',
      });

      return {
        success: response.data.code === '201',
        providerTxnId: transactionId,
        paymentUrl: response.data.data?.payment_url,
        raw: response.data,
      };
    } catch (err: any) {
      logger.error('CinetPay initiate error', { error: err.message });
      return { success: false, providerTxnId: transactionId };
    }
  }

  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }

    try {
      const response = await axios.post(`${CINETPAY_BASE_URL}/payment/check`, {
        apikey: env.CINETPAY.apiKey,
        site_id: env.CINETPAY.siteId,
        transaction_id: providerTxnId,
      });

      const status = response.data.data?.status;
      return {
        success: status === 'ACCEPTED',
        status: status === 'ACCEPTED' ? 'SUCCEEDED' : status === 'REFUSED' ? 'FAILED' : 'PENDING',
        providerTxnId,
        raw: response.data,
      };
    } catch (err: any) {
      logger.error('CinetPay verify error', { error: err.message });
      return { success: false, status: 'FAILED', providerTxnId };
    }
  }

  async handleWebhook(payload: any): Promise<VerifyPaymentResult> {
    // CinetPay sends cpm_trans_id in webhook body
    const providerTxnId = payload.cpm_trans_id || payload.transaction_id;
    return this.verifyPayment(providerTxnId);
  }

  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (this.isMock) {
      logger.info('[CinetPay MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }

    try {
      const response = await axios.post(`${CINETPAY_BASE_URL}/payment/refund`, {
        apikey: env.CINETPAY.apiKey,
        site_id: env.CINETPAY.siteId,
        transaction_id: providerTxnId,
        amount: Math.round(amountXof),
      });
      return { success: response.data.code === '00', refundId: response.data.data?.refund_id, raw: response.data };
    } catch (err: any) {
      logger.error('CinetPay refund error', { error: err.message });
      return { success: false };
    }
  }
}
