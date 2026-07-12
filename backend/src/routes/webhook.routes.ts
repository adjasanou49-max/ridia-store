import { Router } from 'express';
import crypto from 'crypto';
import { orderService } from '../services/OrderService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { env } from '../config/env';

const router = Router();

/**
 * Vérifie le header x-token envoyé par CinetPay sur chaque notification.
 * Schéma officiel (docs.cinetpay.com/api/1.0-en/checkout/hmac) : HMAC-SHA256
 * de la concaténation exacte de ces champs, avec la clé secrète du marchand.
 * Ne bloque jamais la commande en mode mock (tests locaux sans vraie clé).
 */
export function isValidCinetPaySignature(body: Record<string, any>, xToken: string | undefined): boolean {
  if (env.CINETPAY.mode === 'mock') return true;
  if (!xToken) return false;

  const data = [
    body.cpm_site_id,
    body.cpm_trans_id,
    body.cpm_trans_date,
    body.cpm_amount,
    body.cpm_currency,
    body.signature,
    body.payment_method,
    body.cel_phone_num,
    body.cpm_phone_prefixe,
    body.cpm_language,
    body.cpm_version,
    body.cpm_payment_config,
    body.cpm_page_action,
    body.cpm_custom,
    body.cpm_designation,
    body.cpm_error_message,
  ]
    .map((v) => v ?? '')
    .join('');

  const expected = crypto.createHmac('sha256', env.CINETPAY.secretKey).update(data).digest('hex');

  // Comparaison en temps constant pour éviter les attaques par mesure de timing.
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(xToken, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

router.post(
  '/cinetpay',
  asyncHandler(async (req, res) => {
    if (!isValidCinetPaySignature(req.body, req.header('x-token'))) {
      logger.warn('CinetPay webhook rejeté - signature x-token invalide', { body: req.body });
      return res.status(401).send('Invalid signature');
    }

    logger.info('CinetPay webhook received', { body: req.body });
    const providerTxnId = req.body.cpm_trans_id || req.body.transaction_id;
    if (providerTxnId) await orderService.confirmPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

// Note sécurité : Wave, Orange Money et MTN MoMo n'ont pas de vérification de
// signature dédiée ici (contrairement à CinetPay) car leurs schémas exacts
// n'ont pas été confirmés dans la documentation - mieux vaut ne rien vérifier
// que vérifier un mauvais schéma qui donnerait une fausse confiance. Le vrai
// filet de sécurité reste `confirmPayment` : il rappelle systématiquement
// l'API du prestataire (verifyPayment) avant de valider quoi que ce soit,
// donc un webhook falsifié ne peut jamais, à lui seul, confirmer un paiement.
router.post(
  '/wave',
  asyncHandler(async (req, res) => {
    logger.info('Wave webhook received', { body: req.body });
    const providerTxnId = req.body.client_reference;
    if (providerTxnId) await orderService.confirmPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

router.post(
  '/orange-money',
  asyncHandler(async (req, res) => {
    logger.info('Orange Money webhook received', { body: req.body });
    const providerTxnId = req.body.order_id;
    if (providerTxnId) await orderService.confirmPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

router.post(
  '/mtn-momo',
  asyncHandler(async (req, res) => {
    logger.info('MTN MoMo webhook received', { body: req.body });
    const providerTxnId = req.body.referenceId;
    if (providerTxnId) await orderService.confirmPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

// Réservé à la future API de paiement (voir CustomPaymentAdapter.ts) - adapte le nom
// du champ providerTxnId selon le format réel du webhook une fois la doc reçue.
router.post(
  '/custom',
  asyncHandler(async (req, res) => {
    logger.info('Custom payment webhook received', { body: req.body });
    const providerTxnId = req.body.transaction_id || req.body.id;
    if (providerTxnId) await orderService.confirmPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

// WhatsApp webhook verification (GET) + incoming messages (POST)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/whatsapp', (req, res) => {
  logger.info('WhatsApp incoming webhook', { body: req.body });
  res.status(200).send('OK');
});

export default router;
