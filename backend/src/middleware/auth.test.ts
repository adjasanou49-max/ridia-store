import jwt from 'jsonwebtoken';
import { authenticate, optionalAuthenticate } from './auth';

const SECRET = 'test-access-secret';
jest.mock('../config/env', () => ({ env: { JWT_ACCESS_SECRET: 'test-access-secret' } }));

function mockReqRes(token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res: any = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticate - protection contre la confusion de type de jeton', () => {
  it('accepte un vrai token de session (avec role, sans purpose)', () => {
    const token = jwt.sign({ userId: 'u1', role: 'CUSTOMER' }, SECRET, { algorithm: 'HS256' });
    const { req, res, next } = mockReqRes(token);

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual(expect.objectContaining({ userId: 'u1', role: 'CUSTOMER' }));
  });

  it("rejette un token de réinitialisation de mot de passe utilisé comme token de session (faille de confusion de jeton)", () => {
    // Même secret que les tokens de session (voir AuthService.forgotPassword) -
    // c'est justement ce qui rendait la confusion possible avant la correction.
    const resetToken = jwt.sign({ userId: 'u1', purpose: 'password_reset' }, SECRET, {
      algorithm: 'HS256',
    });
    const { req, res, next } = mockReqRes(resetToken);

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejette un token de vérification d'email utilisé comme token de session", () => {
    const verifyToken = jwt.sign({ userId: 'u1', purpose: 'email_verify' }, SECRET, {
      algorithm: 'HS256',
    });
    const { req, res, next } = mockReqRes(verifyToken);

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejette un token signé avec l\'algorithme "none" (falsification de signature)', () => {
    // Un vrai token "alg: none" n'a pas de signature du tout.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: 'attaquant', role: 'SUPER_ADMIN' })).toString(
      'base64url'
    );
    const forgedToken = `${header}.${payload}.`;
    const { req, res, next } = mockReqRes(forgedToken);

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejette une absence de token', () => {
    const { req, res, next } = mockReqRes();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe('optionalAuthenticate - même protection en mode optionnel', () => {
  it('ignore silencieusement un token de réinitialisation (traite comme anonyme, ne plante pas)', () => {
    const resetToken = jwt.sign({ userId: 'u1', purpose: 'password_reset' }, SECRET, {
      algorithm: 'HS256',
    });
    const { req, res, next } = mockReqRes(resetToken);

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('accepte un vrai token de session', () => {
    const token = jwt.sign({ userId: 'u1', role: 'CUSTOMER' }, SECRET, { algorithm: 'HS256' });
    const { req, res, next } = mockReqRes(token);

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual(expect.objectContaining({ userId: 'u1', role: 'CUSTOMER' }));
  });
});
