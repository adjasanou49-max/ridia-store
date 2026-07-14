'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold text-gray-900">Une erreur est survenue</p>
          <p className="text-sm text-gray-500">
            Le problème a été signalé automatiquement à notre équipe technique.
          </p>
          <button
            onClick={() => reset()}
            className="rounded-full bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
