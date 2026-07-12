'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';

type WalletTransactionType = 'CREDIT_REFUND' | 'CREDIT_ADMIN' | 'DEBIT_ORDER_PAYMENT' | 'DEBIT_ADMIN';

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
  CREDIT_REFUND: 'Remboursement',
  CREDIT_ADMIN: 'Crédit',
  DEBIT_ORDER_PAYMENT: 'Paiement commande',
  DEBIT_ADMIN: 'Ajustement',
};

export default function WalletPage() {
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
              Utilisable pour payer tout ou partie de tes prochaines commandes, directement au checkout.
            </p>
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
