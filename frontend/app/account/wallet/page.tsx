'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatXof, formatDate } from '@/lib/utils';
import type { PaymentProvider } from '@/types';

type WalletTransactionType =
  | 'CREDIT_TOPUP'
  | 'CREDIT_REFUND'
  | 'CREDIT_ADMIN'
  | 'DEBIT_ORDER_PAYMENT'
  | 'DEBIT_ADMIN';

interface WalletTransaction {
  id: string;
  amountXof: number;
  type: WalletTransactionType;
  reason: string;
  createdAt: string;
}

interface WalletData {
  balanceXof: number;
  transactions: WalletTransaction[];
}

const TYPE_LABELS: Record<WalletTransactionType, string> = {
  CREDIT_TOPUP: 'Dépôt',
  CREDIT_REFUND: 'Remboursement',
  CREDIT_ADMIN: 'Crédit',
  DEBIT_ORDER_PAYMENT: 'Paiement commande',
  DEBIT_ADMIN: 'Ajustement',
};

const PROVIDER_OPTIONS: { value: PaymentProvider; label: string }[] = [
  { value: 'WAVE', label: 'Wave' },
  { value: 'ORANGE_MONEY', label: 'Orange Money' },
  { value: 'MTN_MONEY', label: 'MTN Mobile Money' },
];

export default function WalletPage() {
  const { user } = useAuth();
  const [showTopUp, setShowTopUp] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => (await api.get<WalletData>('/wallet')).data,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mon Wallet</h1>

      {isLoading || !data ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <>
          <div className="bg-white p-6 rounded-xl border border-gray-100 mb-6">
            <p className="text-sm text-gray-500 mb-1">Solde disponible</p>
            <p className="text-3xl font-bold text-brand-600">{formatXof(data.balanceXof)}</p>
            <p className="text-xs text-gray-400 mt-2">
              Utilisable pour payer tes prochaines commandes. Ce solde ne peut pas être retiré en
              espèces - remboursements, dépôts et crédits sont uniquement dépensables sur Ridia Store.
            </p>

            <button
              onClick={() => setShowTopUp((v) => !v)}
              className="mt-4 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2 rounded-lg text-sm"
            >
              Déposer de l&apos;argent
            </button>

            {showTopUp && (
              <TopUpForm
                userName={user ? `${user.firstName} ${user.lastName}` : ''}
                userPhone={user?.phone || ''}
                onDone={() => setShowTopUp(false)}
              />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
            <div className="p-4">
              <h2 className="font-semibold text-sm">Historique</h2>
            </div>
            {data.transactions.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">Aucune transaction pour l&apos;instant.</p>
            ) : (
              data.transactions.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.reason}</p>
                    <p className="text-xs text-gray-400">
                      {TYPE_LABELS[t.type]} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      t.amountXof >= 0 ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {t.amountXof >= 0 ? '+' : ''}
                    {formatXof(t.amountXof)}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TopUpForm({
  userName,
  userPhone,
  onDone,
}: {
  userName: string;
  userPhone: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<PaymentProvider>('WAVE');
  const [phone, setPhone] = useState(userPhone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post('/wallet/topup', {
        amountXof: Number(amount),
        provider,
        phone,
        name: userName,
      });
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors du dépôt');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-gray-100 space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Montant (FCFA)</label>
        <input
          type="number"
          min="100"
          step="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Moyen de paiement</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as PaymentProvider)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Numéro de téléphone</label>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? 'Redirection...' : 'Continuer le dépôt'}
      </button>
    </form>
  );
}
