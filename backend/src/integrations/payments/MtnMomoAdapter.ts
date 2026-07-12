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

const MTN_BASE_URL = 'https://sandbox.momodeveloper.mtn.com/collection';

export class MtnMomoAdapter implements PaymentAdapter {
  readonly providerName = 'MTN_MONEY';

  private get isMock() {
    return env.MTN_MOMO.mode !== 'live';
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const referenceId = nanoid();

    if (this.isMock) {
      logger.info('[MTN MOMO MOCK] Initiating payment', { referenceId, amount: params.amountXof });
      return {
        success: true,
        providerTxnId: referenceId,
        paymentUrl: `${env.FRONTEND_URL}/payment/mock?provider=mtn&txn=${referenceId}`,
      };
    }

    try {
      await axios.post(
        `${MTN_BASE_URL}/v1_0/requesttopay`,
        {
          amount: String(Math.round(params.amountXof)),
          currency: 'XOF',
          externalId: params.orderId,
          payer: { partyIdType: 'MSISDN', partyId: params.customerPhone },
          payerMessage: params.description,
          payeeNote: 'Ridia Store payment',
        },
        {
          headers: {
            'X-Reference-Id': referenceId,
            'X-Target-Environment': 'mtnbenin',
            'Ocp-Apim-Subscription-Key': env.MTN_MOMO.subscriptionKey,
            Authorization: `Bearer ${env.MTN_MOMO.apiKey}`,
          },
        }
      );

      return { success: true, providerTxnId: referenceId };
    } catch (err: any) {
      logger.error('MTN MOMO initiate error', { error: err.message });
      return { success: false, providerTxnId: referenceId };
    }
  }

  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (this.isMock) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }

    try {
      const response = await axios.get(`${MTN_BASE_URL}/v1_0/requesttopay/${providerTxnId}`, {
        headers: {
          'X-Target-Environment': 'mtnbenin',
          'Ocp-Apim-Subscription-Key': env.MTN_MOMO.subscriptionKey,
          Authorization: `Bearer ${env.MTN_MOMO.apiKey}`,
        },
      });
      const status = response.data.status;
      return {
        success: status === 'SUCCESSFUL',
        status: status === 'SUCCESSFUL' ? 'SUCCEEDED' : status === 'FAILED' ? 'FAILED' : 'PENDING',
        providerTxnId,
        raw: response.data,
      };
    } catch (err: any) {
      // Correction bug fiabilité : voir le commentaire équivalent dans
      // WaveAdapter.verifyPayment - une erreur réseau n'est pas un échec de
      // paiement confirmé, ne jamais la traiter comme définitive.
      logger.error('MTN MOMO verify error', { error: err.message });
      return { success: false, status: 'PENDING', providerTxnId };
    }
  }

  async handleWebhook(payload: any): Promise<VerifyPaymentResult> {
    return this.verifyPayment(payload.referenceId);
  }

  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (this.isMock) {
      logger.info('[MTN MoMo MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }
    try {
      const response = await axios.post(
        `https://sandbox.momodeveloper.mtn.com/collection/v1_0/refund`,
        { amount: String(amountXof), currency: 'XOF', externalId: providerTxnId },
        { headers: { 'Ocp-Apim-Subscription-Key': env.MTN_MOMO.subscriptionKey } }
      );
      return { success: true, raw: response.data };
    } catch (err: any) {
      logger.error('MTN MoMo refund error', { error: err.message });
      return { success: false };
    }
  }
}
