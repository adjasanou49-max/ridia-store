import { PaymentAdapter, InitiatePaymentParams, InitiatePaymentResult, VerifyPaymentResult, RefundResult } from './PaymentAdapter';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * ==========================================================================
 * ADAPTER GÉNÉRIQUE - À REMPLIR quand une nouvelle API de paiement arrive
 * ==========================================================================
 *
 * Marche à suivre pour brancher une nouvelle API de paiement (ou n'importe
 * quelle autre API tierce à l'avenir) SANS toucher au reste de l'application :
 *
 * 1. Remplis les 3 méthodes ci-dessous (initiatePayment, verifyPayment,
 *    handleWebhook) avec les vrais appels HTTP de la doc du provider.
 * 2. Ajoute les clés API nécessaires dans `env.ts` (section CUSTOM_PAYMENT)
 *    et dans `.env.example` / `.env`.
 * 3. Rien d'autre à changer : OrderService, les routes, le frontend
 *    fonctionnent déjà avec n'importe quel provider grâce à
 *    PaymentProviderRegistry (voir ce fichier) - ils appellent juste
 *    "l'adapter du provider demandé", peu importe lequel.
 * 4. Ajoute l'URL de webhook chez le provider :
 *    https://TON_BACKEND/api/webhooks/custom
 *
 * Ce même pattern (une classe qui respecte une interface commune) s'applique
 * à toute future intégration : une autre app de livraison, un autre SMS
 * gateway, etc. Un seul fichier à écrire, zéro fichier existant à modifier.
 * ==========================================================================
 */
export class CustomPaymentAdapter implements PaymentAdapter {
  readonly providerName = 'CUSTOM';

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    if (!env.CUSTOM_PAYMENT.apiKey) {
      logger.info('[CUSTOM PAYMENT MOCK] Aucune clé API configurée - simulation de succès', {
        orderId: params.orderId,
      });
      return {
        success: true,
        providerTxnId: `custom-mock-${Date.now()}`,
        paymentUrl: undefined,
      };
    }

    // TODO: remplacer par le vrai appel à l'API une fois la doc reçue, ex:
    // const { data } = await axios.post(`${env.CUSTOM_PAYMENT.baseUrl}/payments`, {
    //   amount: params.amountXof,
    //   currency: 'XOF',
    //   phone: params.customerPhone,
    //   description: params.description,
    //   callback_url: `${env.API_BASE_URL}/api/webhooks/custom`,
    // }, { headers: { Authorization: `Bearer ${env.CUSTOM_PAYMENT.apiKey}` } });
    // return { success: true, providerTxnId: data.id, paymentUrl: data.payment_url };

    throw new Error("CustomPaymentAdapter: à implémenter avec la doc de l'API reçue");
  }

  async verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult> {
    if (!env.CUSTOM_PAYMENT.apiKey) {
      return { success: true, status: 'SUCCEEDED', providerTxnId };
    }

    // TODO: const { data } = await axios.get(`${env.CUSTOM_PAYMENT.baseUrl}/payments/${providerTxnId}`, ...);
    throw new Error("CustomPaymentAdapter: à implémenter avec la doc de l'API reçue");
  }

  async handleWebhook(payload: unknown): Promise<VerifyPaymentResult> {
    // TODO: adapter selon le format exact du webhook du provider
    logger.info('[CUSTOM PAYMENT] Webhook reçu', { payload });
    throw new Error("CustomPaymentAdapter: à implémenter avec la doc de l'API reçue");
  }

  async refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult> {
    if (!env.CUSTOM_PAYMENT.apiKey) {
      logger.info('[CUSTOM PAYMENT MOCK] Refunding payment', { providerTxnId, amountXof });
      return { success: true, refundId: `refund-mock-${providerTxnId}` };
    }
    // TODO: implémenter avec la doc de l'API reçue
    throw new Error("CustomPaymentAdapter.refundPayment: à implémenter avec la doc de l'API reçue");
  }
}
