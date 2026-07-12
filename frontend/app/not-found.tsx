import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-brand-500 mb-2">404</p>
      <h1 className="text-xl font-semibold mb-2">Cette page n&apos;existe pas</h1>
      <p className="text-gray-500 mb-6 max-w-sm">
        Le lien est peut-être incorrect, ou la page a été déplacée. Retourne à l&apos;accueil pour continuer tes achats.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
