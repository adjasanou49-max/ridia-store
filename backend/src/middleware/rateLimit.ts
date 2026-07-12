import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
});

// Stricter limiter for auth endpoints (prevent brute force)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.' },
});

// Upload ouvert à tous les utilisateurs connectés (avatar, photos d'avis) - limite
// raisonnable pour éviter l'abus de la pipeline de compression/stockage.
export const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'uploads, réessaie dans quelques minutes." },
});

// Recherche par image : route PUBLIQUE (pas de compte requis) mais chaque appel
// coûte un vrai appel API (Claude) - limite volontairement stricte pour éviter
// l'abus, contrairement à uploadRateLimiter qui suppose un compte authentifié.
export const imageSearchRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de recherches par image, réessaie dans quelques minutes.' },
});
