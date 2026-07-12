'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';

interface WithdrawalRequest {
  id: string;
  amountXof: number;
  phoneNumber: string;
  createdAt: string;
  wallet: {
    user: { firstName: string; lastName: string; phone: string | null; email: string };
  };
}

export default function AdminWalletWithdrawalsPage() {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'wallet', 'withdrawals'],
    queryFn: async () => (await api.get<WithdrawalRequest[]>('/admin/wallet/withdrawals')).data,
  });

  async function resolve(id: string, approve: boolean) {
    const note = approve
      ? "Confirmé - argent envoyé manuellement à l'utilisateur"
      : prompt('Motif du refus (recrédite le wallet du client) :') || undefined;
    if (!approve && note === undefined) return;

    setProcessingId(id);
    try {
      await api.patch(`/admin/wallet/withdrawals/${id}`, { approve, note });
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallet', 'withdrawals'] });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Retraits Wallet en attente</h1>
      <p className="text-gray-500 text-sm mb-6">
        Envoie l&apos;argent manuellement au numéro indiqué (Wave/Orange Money/MTN), puis confirme
        ici. En cas de refus, le montant est recrédité automatiquement au wallet du client.
      </p>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : !data || data.length === 0 ? (
        <p className="text-gray-400">Aucune demande de retrait en attente.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {data.map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">
                  {r.wallet.user.firstName} {r.wallet.user.lastName}
                </p>
                <p className="text-xs text-gray-500">{r.wallet.user.email}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Envoyer à : <strong>{r.phoneNumber}</strong> · Demandé le {formatDate(r.createdAt)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-lg mb-2">{formatXof(r.amountXof)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolve(r.id, true)}
                    disabled={processingId === r.id}
                    className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 disabled:opacity-50"
                  >
                    Confirmer l&apos;envoi
                  </button>
                  <button
                    onClick={() => resolve(r.id, false)}
                    disabled={processingId === r.id}
                    className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
