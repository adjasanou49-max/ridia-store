'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-red-500 mb-2">Oups</p>
      <h1 className="text-xl font-semibold mb-2">Une erreur est survenue</h1>
      <p className="text-gray-500 mb-6 max-w-sm">
        Quelque chose s&apos;est mal passé de notre côté. Réessaie, ou reviens plus tard si le problème persiste.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
