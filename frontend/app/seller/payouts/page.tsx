'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

interface SellerStats {
  totalPayoutOwed: number;
}

const METHODS = [
  { value: 'ORANGE_MONEY', label: 'Orange Money' },
  { value: 'WAVE', label: 'Wave' },
  { value: 'MTN_MONEY', label: 'MTN Mobile Money' },
  { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
];

export default function SellerPayoutsPage() {
  const [amountXof, setAmountXof] = useState('');
  const [method, setMethod] = useState('ORANGE_MONEY');
  const [destinationRef, setDestinationRef] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['seller', 'dashboard'],
    queryFn: async () => (await api.get<SellerStats>('/seller/dashboard')).data,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await api.post('/seller/payouts', {
        amountXof: Number(amountXof),
        method,
        destinationRef,
      });
      setMessage('✅ Demande de payout envoyée. Traitement sous 24-48h.');
      setAmountXof('');
      setDestinationRef('');
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur lors de la demande'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mes paiements</h1>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-5 mb-6">
        <p className="text-sm text-gray-600">Solde disponible à retirer</p>
        <p className="text-3xl font-bold text-brand-700">
          {stats ? formatXof(stats.totalPayoutOwed) : '...'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-4 max-w-md">
        <h2 className="font-semibold">Demander un retrait</h2>

        {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

        <div>
          <label className="block text-sm font-medium mb-1">Montant (XOF)</label>
          <input
            type="number"
            required
            value={amountXof}
            onChange={(e) => setAmountXof(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Méthode</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Numéro / référence de destination
          </label>
          <input
            required
            value={destinationRef}
            onChange={(e) => setDestinationRef(e.target.value)}
            placeholder="+226 XX XX XX XX ou IBAN"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? 'Envoi...' : 'Demander le retrait'}
        </button>
      </form>
    </div>
  );
}
