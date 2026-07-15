import { Router, Request } from 'express';
import crypto from 'crypto';
import { orderService } from '../services/OrderService';
import { walletService } from '../services/WalletService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { env } from '../config/env';

const router = Router();

/**
 * Un même providerTxnId peut correspondre soit au paiement d'une commande,
 * soit à un dépôt wallet (voir WalletService.initiateTopUp) - on tente
 * d'abord la commande (cas le plus fréquent), et si aucun paiement de
 * commande ne correspond, on tente un dépôt wallet avant d'abandonner.
 */
async function confirmAnyPayment(providerTxnId: string) {
  try {
    await orderService.confirmPayment(providerTxnId);
    return;
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 404) throw err;
  }
  await walletService.confirmTopUp(providerTxnId);
}

/**
 * Vérifie la signature Wave-Signature (doc officielle : docs.wave.com/webhook).
 * Format : "t={timestamp},v1={signature}" - HMAC-SHA256 de (timestamp + corps
 * brut) avec le secret du webhook. Rejette aussi les requêtes de plus de 5
 * minutes (anti-rejeu), comme recommandé par Wave.
 *
 * Ne s'applique qu'en mode live (WAVE_WEBHOOK_SECRET configuré) : en mode
 * mock il n'y a pas de vrai webhook Wave à vérifier.
 */
function verifyWaveSignature(rawBody: string, header: string | undefined): boolean {
  if (!env.WAVE.webhookSecret) return true; // mode mock, rien à vérifier
  if (!header) return false;

  const parts = header.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const timestamp = timestampPart?.split('=')[1];
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.split('=')[1]);
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > 300) return false; // >5 min, rejeté même côté Wave

  const expected = crypto
    .createHmac('sha256', env.WAVE.webhookSecret)
    .update(timestamp + rawBody)
    .digest('hex');

  // Comparaison à temps constant pour chaque signature candidate (rotation de secret =
  // parfois 2 signatures valides en même temps, voir doc "Secret Rotation")
  return signatures.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

router.post(
  '/wave',
  asyncHandler(async (req: Request & { rawBody?: string }, res) => {
    const isValid = verifyWaveSignature(req.rawBody ?? '', req.header('Wave-Signature'));
    if (!isValid) {
      logger.error('Wave webhook: signature invalide, requête ignorée');
      // 401 plutôt que de laisser Wave croire que c'est traité - il retentera.
      return res.status(401).send('Invalid signature');
    }

    logger.info('Wave webhook received', { body: req.body });
    const providerTxnId = req.body?.data?.client_reference ?? req.body?.client_reference;
    if (providerTxnId) await confirmAnyPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

// Note sécurité : contrairement à Wave (voir plus haut), Orange Money et MTN
// MoMo n'ont pas de vérification de signature dédiée ici car leurs schémas
// exacts n'ont pas été confirmés dans la documentation - mieux vaut ne rien
// vérifier que vérifier un mauvais schéma qui donnerait une fausse confiance.
// Le vrai filet de sécurité reste `confirmPayment` : il rappelle
// systématiquement l'API du prestataire (verifyPayment) avant de valider quoi
// que ce soit, donc un webhook falsifié ne peut jamais, à lui seul, confirmer
// un paiement - même pour ces deux-là.
router.post(
  '/orange-money',
  asyncHandler(async (req, res) => {
    logger.info('Orange Money webhook received', { body: req.body });
    const providerTxnId = req.body.order_id;
    if (providerTxnId) await confirmAnyPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

router.post(
  '/mtn-momo',
  asyncHandler(async (req, res) => {
    logger.info('MTN MoMo webhook received', { body: req.body });
    const providerTxnId = req.body.referenceId;
    if (providerTxnId) await confirmAnyPayment(providerTxnId);
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
    if (providerTxnId) await confirmAnyPayment(providerTxnId);
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
