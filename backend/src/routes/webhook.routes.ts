import { Router } from 'express';
import { orderService } from '../services/OrderService';
import { walletService } from '../services/WalletService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

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

// Note sécurité : Wave, Orange Money et MTN MoMo n'ont pas de vérification de
// signature dédiée ici car leurs schémas exacts n'ont pas été confirmés dans
// la documentation - mieux vaut ne rien vérifier que vérifier un mauvais
// schéma qui donnerait une fausse confiance. Le vrai filet de sécurité reste
// `confirmPayment` : il rappelle systématiquement l'API du prestataire
// (verifyPayment) avant de valider quoi que ce soit,
// donc un webhook falsifié ne peut jamais, à lui seul, confirmer un paiement.
router.post(
  '/wave',
  asyncHandler(async (req, res) => {
    logger.info('Wave webhook received', { body: req.body });
    const providerTxnId = req.body.client_reference;
    if (providerTxnId) await confirmAnyPayment(providerTxnId);
    res.status(200).send('OK');
  })
);

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
