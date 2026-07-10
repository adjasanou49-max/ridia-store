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

// ---------------- Security & Middleware ----------------
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '15mb' }));
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
app.listen(env.PORT, () => {
  logger.info(`🚀 Ridia Store API démarré sur le port ${env.PORT} (${env.NODE_ENV})`);
});

export default app;
