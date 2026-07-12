jest.mock('axios');
jest.mock('../../config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../config/env', () => ({
  env: {
    ORANGE_MONEY: { mode: 'live', clientId: 'id', clientSecret: 'secret' },
    FRONTEND_URL: 'https://ridiastore.test',
  },
}));

import { OrangeMoneyAdapter } from './OrangeMoneyAdapter';
import { logger } from '../../config/logger';

describe('OrangeMoneyAdapter.verifyPayment - correction faille critique (faux positif systématique)', () => {
  const adapter = new OrangeMoneyAdapter();

  it("ne confirme JAMAIS un paiement comme réussi en mode réel (l'intégration n'est pas implémentée)", async () => {
    const result = await adapter.verifyPayment('txn-quelconque');

    expect(result.status).not.toBe('SUCCEEDED');
    expect(result.status).toBe('PENDING');
    expect(result.success).toBe(false);
  });

  it('journalise un avertissement clair plutôt que de confirmer silencieusement', async () => {
    await adapter.verifyPayment('txn-quelconque');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('non implémentée'),
      expect.objectContaining({ providerTxnId: 'txn-quelconque' })
    );
  });
});

describe('OrangeMoneyAdapter.refundPayment - remboursement automatique désactivé', () => {
  const adapter = new OrangeMoneyAdapter();

  it('échoue proprement en mode réel plutôt que de tenter un remboursement non fiable', async () => {
    const result = await adapter.refundPayment('txn-1', 5000);

    expect(result.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('désactivé'),
      expect.objectContaining({ providerTxnId: 'txn-1', amountXof: 5000 })
    );
  });
});
