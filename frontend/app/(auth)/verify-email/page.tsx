'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-gray-400">Chargement...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      queueMicrotask(() => setStatus('error'));
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        {status === 'loading' && <p className="text-gray-400">Vérification en cours...</p>}
        {status === 'success' && (
          <>
            <p className="text-green-600 mb-4">✅ Ton email est maintenant vérifié !</p>
            <Link href="/" className="text-brand-600 font-medium hover:underline">
              Retour à l&apos;accueil
            </Link>
          </>
        )}
        {status === 'error' && (
          <p className="text-red-600">Lien invalide ou expiré. Redemande un email de vérification depuis tes paramètres.</p>
        )}
      </div>
    </div>
  );
}
