jest.mock('axios');
jest.mock('../../config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('nanoid', () => ({ nanoid: () => 'ABC123' }));
jest.mock('../../config/env', () => ({
  env: {
    WAVE: { mode: 'live', apiKey: 'key' },
    MTN_MOMO: { mode: 'live', apiKey: 'key', userId: 'user', subscriptionKey: 'sub' },
    FRONTEND_URL: 'https://ridiastore.test',
  },
}));

import axios from 'axios';
import { WaveAdapter } from './WaveAdapter';
import { MtnMomoAdapter } from './MtnMomoAdapter';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WaveAdapter.verifyPayment - correction fiabilité (erreur réseau ≠ échec de paiement)', () => {
  const adapter = new WaveAdapter();

  it("renvoie PENDING (pas FAILED) sur une erreur réseau/timeout - le client a peut-être bien payé", async () => {
    mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

    const result = await adapter.verifyPayment('txn-1');

    expect(result.status).toBe('PENDING');
    expect(result.status).not.toBe('FAILED');
  });
});

describe('MtnMomoAdapter.verifyPayment - correction fiabilité (erreur réseau ≠ échec de paiement)', () => {
  const adapter = new MtnMomoAdapter();

  it('renvoie PENDING (pas FAILED) sur une erreur réseau/timeout', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

    const result = await adapter.verifyPayment('txn-2');

    expect(result.status).toBe('PENDING');
    expect(result.status).not.toBe('FAILED');
  });
});
