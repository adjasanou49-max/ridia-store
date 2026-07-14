import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  tracesSampleRate: 0.2,
  // Ne rien envoyer si aucun DSN n'est configuré (dev local, previews sans clé).
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
