'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ActiverAdminPage() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/redeem-admin-code', { code: code.trim() });
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/admin/dashboard'; // rechargement complet pour rafraîchir le rôle
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Code invalide');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">Connecte-toi d&apos;abord pour activer un code admin.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-2 text-center">Activer un accès admin</h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        Entre le code que le propriétaire t&apos;a transmis. Il ne fonctionne qu&apos;une seule
        fois.
      </p>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        {success ? (
          <p className="text-sm text-green-600 text-center">
            ✅ Accès admin activé ! Redirection...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ADMIN-XXXXXXXXXX"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Vérification...' : 'Activer'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
