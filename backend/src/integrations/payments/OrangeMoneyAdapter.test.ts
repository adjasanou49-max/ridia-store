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

import axios from 'axios';
import { OrangeMoneyAdapter } from './OrangeMoneyAdapter';
import { logger } from '../../config/logger';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrangeMoneyAdapter.verifyPayment', () => {
  const adapter = new OrangeMoneyAdapter();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(
    "ne confirme JAMAIS un paiement comme réussi sans payToken (invariant de sécurité hérité de la " +
      'correction de la faille critique - un appel sans contexte ne doit jamais se solder par SUCCEEDED)',
    async () => {
      const result = await adapter.verifyPayment('txn-quelconque');

      expect(result.status).not.toBe('SUCCEEDED');
      expect(result.status).toBe('PENDING');
      expect(result.success).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('payToken'),
        expect.objectContaining({ providerTxnId: 'txn-quelconque' })
      );
    }
  );

  it('confirme le paiement quand Orange renvoie SUCCESS pour un payToken valide', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'token-123' } }) // getAccessToken
      .mockResolvedValueOnce({ data: { status: 'SUCCESS', order_id: 'txn-1', txnid: 'MP123' } }); // transactionstatus

    const result = await adapter.verifyPayment('txn-1', { payToken: 'pay-token-abc', amountXof: 5000 });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenLastCalledWith(
      expect.stringContaining('/transactionstatus'),
      expect.objectContaining({ order_id: 'txn-1', pay_token: 'pay-token-abc', amount: 5000 }),
      expect.anything()
    );
  });

  it('ne confirme jamais un paiement FAILED/EXPIRED comme réussi', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'token-123' } })
      .mockResolvedValueOnce({ data: { status: 'FAILED', order_id: 'txn-2' } });

    const result = await adapter.verifyPayment('txn-2', { payToken: 'pay-token-abc', amountXof: 5000 });

    expect(result.status).toBe('FAILED');
    expect(result.status).not.toBe('SUCCEEDED');
  });

  it('reste PENDING (jamais SUCCEEDED) pour un statut INITIATED/PENDING côté Orange', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'token-123' } })
      .mockResolvedValueOnce({ data: { status: 'INITIATED', order_id: 'txn-3' } });

    const result = await adapter.verifyPayment('txn-3', { payToken: 'pay-token-abc', amountXof: 5000 });

    expect(result.status).toBe('PENDING');
    expect(result.success).toBe(false);
  });

  it("reste PENDING (jamais SUCCEEDED) si l'appel à Orange échoue (panne réseau, timeout...)", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('network error'));

    const result = await adapter.verifyPayment('txn-4', { payToken: 'pay-token-abc', amountXof: 5000 });

    expect(result.status).toBe('PENDING');
    expect(result.success).toBe(false);
    expect(logger.error).toHaveBeenCalled();
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
