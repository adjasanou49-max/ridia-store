import crypto from 'crypto';

jest.mock('../config/env', () => ({
  env: {
    CINETPAY: { mode: 'production', secretKey: 'test-secret-key' },
  },
}));
jest.mock('../services/OrderService', () => ({ orderService: { confirmPayment: jest.fn() } }));

import { isValidCinetPaySignature } from './webhook.routes';

function computeValidToken(body: Record<string, any>, secretKey: string): string {
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
  return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
}

describe('isValidCinetPaySignature', () => {
  const body = {
    cpm_site_id: 'site1',
    cpm_trans_id: 'trans1',
    cpm_trans_date: '2026-07-12',
    cpm_amount: '5000',
    cpm_currency: 'XOF',
    signature: 'sig',
    payment_method: 'OM',
    cel_phone_num: '+22670000000',
  };

  it('accepte un token correctement calculé avec la vraie clé secrète', () => {
    const validToken = computeValidToken(body, 'test-secret-key');
    expect(isValidCinetPaySignature(body, validToken)).toBe(true);
  });

  it('rejette un token calculé avec une mauvaise clé secrète', () => {
    const wrongToken = computeValidToken(body, 'une-autre-cle');
    expect(isValidCinetPaySignature(body, wrongToken)).toBe(false);
  });

  it('rejette si le corps de la requête a été modifié après signature (ex: montant altéré)', () => {
    const validToken = computeValidToken(body, 'test-secret-key');
    const tamperedBody = { ...body, cpm_amount: '999999' };
    expect(isValidCinetPaySignature(tamperedBody, validToken)).toBe(false);
  });

  it("rejette si le header x-token est absent", () => {
    expect(isValidCinetPaySignature(body, undefined)).toBe(false);
  });
});
