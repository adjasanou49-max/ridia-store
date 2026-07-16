import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/node';
import { env } from './config/env';
import { logger } from './config/logger';
import { globalRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes/index';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.2 });
  logger.info('Sentry initialisé');
}

const app = express();

// Railway (comme tout hébergeur cloud) place l'app derrière un proxy inverse
// qui ajoute l'en-tête X-Forwarded-For avec la vraie IP du client. Sans ce
// réglage, express-rate-limit ne peut pas identifier correctement qui fait
// quoi : soit tout le monde partage l'IP interne du proxy (rate limiting
// inefficace, un abus n'importe où impacte tout le monde), soit ça plante.
// `1` = on ne fait confiance qu'à UN seul saut de proxy (celui de Railway) -
// jamais une valeur plus permissive, sinon un client pourrait injecter son
// propre X-Forwarded-For pour usurper l'IP de quelqu'un d'autre et contourner
// le rate limiting.
app.set('trust proxy', 1);

// ---------------- Security & Middleware ----------------
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(compression());
// `verify` conserve le corps brut de la requête dans req.rawBody, en plus du
// JSON parsé habituel. Nécessaire pour la vérification de signature Wave :
// la signature porte sur les octets exacts envoyés par Wave, et reparser
// puis re-sérialiser le JSON (même avec les mêmes données) change l'ordre
// des espaces/clés et invalide la signature - piège explicitement documenté
// par Wave lui-même.
app.use(
  express.json({
    limit: '15mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimiter);

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ---------------- Routes ----------------
app.use('/api', apiRoutes);

app.get('/', (_req, res) => {
  res.json({ name: 'Ridia Store API', version: '1.0.0', status: 'running' });
});

// ---------------- Error handling ----------------
if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------- Start server ----------------
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Ridia Store API démarré sur le port ${env.PORT} (${env.NODE_ENV})`);
});

/**
 * Arrêt propre : Railway (et la plupart des hébergeurs) envoient SIGTERM
 * avant de tuer le processus lors d'un redéploiement. Sans ce gestionnaire,
 * les requêtes en cours sont coupées brutalement et la connexion à la base
 * de données n'est jamais fermée proprement (risque de connexions
 * fantômes qui s'accumulent au fil des déploiements).
 */
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} reçu - arrêt propre en cours...`);

  // Arrête d'accepter de nouvelles connexions, laisse les requêtes en cours se terminer
  server.close(async () => {
    try {
      const { prisma } = await import('./config/prisma');
      await prisma.$disconnect();
      logger.info('Connexion base de données fermée proprement');
    } catch (err: any) {
      logger.error('Erreur lors de la fermeture de la base de données', { error: err.message });
    }
    process.exit(0);
  });

  // Filet de sécurité : si des requêtes traînent trop longtemps, on force
  // l'arrêt plutôt que de laisser Railway tuer le processus sans logs.
  setTimeout(() => {
    logger.error("Arrêt forcé après 10s - des requêtes n'ont pas pu se terminer à temps");
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
