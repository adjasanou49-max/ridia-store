import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
      tracesSampleRate: 0.2,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
      tracesSampleRate: 0.2,
    });
  }
}

// Capture les erreurs de rendu serveur (Server Components, layouts) -
// exactement le type d'erreur qui a causé l'écran "This page couldn't load".
export const onRequestError = Sentry.captureRequestError;
