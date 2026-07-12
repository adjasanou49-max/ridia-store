import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '@prisma/client';

export interface AuthPayload {
  userId: string;
  role: UserRole;
  sellerId?: string;
}

/**
 * Les tokens de réinitialisation de mot de passe et de vérification d'email
 * (voir AuthService.forgotPassword/sendEmailVerification) sont signés avec le
 * même secret que les tokens de session, mais NE DOIVENT JAMAIS servir de
 * jeton d'authentification générale - ils contiennent un champ `purpose` que
 * les vrais tokens de session n'ont jamais. Sans ce contrôle, un token de
 * réinitialisation (valable 1h, souvent transmis par email/URL, donc plus
 * exposé) pourrait être rejoué comme un token de session normal sur
 * n'importe quelle route protégée par `authenticate` seul (sans vérification
 * de rôle), usurpant l'identité du titulaire pendant sa durée de validité.
 */
function isSessionToken(payload: any): payload is AuthPayload {
  return typeof payload === 'object' && payload !== null && !payload.purpose && !!payload.role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (!isSessionToken(payload)) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    req.auth = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

/**
 * Variante réservée aux connexions EventSource (flux de notifications temps réel) :
 * le navigateur natif `EventSource` ne peut envoyer aucun header personnalisé, donc
 * le token est accepté en paramètre d'URL pour cette seule route. Jamais utilisé
 * ailleurs - toutes les autres routes exigent le header Authorization classique.
 */
export function authenticateViaQueryToken(req: Request, res: Response, next: NextFunction) {
  const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (!isSessionToken(payload)) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Accès refusé - permissions insuffisantes' });
    }
    next();
  };
}

// Optional auth - doesn't fail if no token, but populates req.auth if valid
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      if (isSessionToken(payload)) {
        req.auth = payload;
      }
    } catch {
      // ignore invalid token, treat as anonymous
    }
  }
  next();
}
