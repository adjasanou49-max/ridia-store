'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface LoyaltyAccount {
  pointsBalance: number;
  lifetimePoints: number;
  tier: string;
  transactions: { id: string; points: number; reason: string; createdAt: string }[];
}

interface Referral {
  id: string;
  createdAt: string;
  referred: { firstName: string; createdAt: string };
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  bronze: { label: 'Bronze', color: 'bg-orange-100 text-orange-700' },
  argent: { label: 'Argent', color: 'bg-gray-100 text-gray-700' },
  or: { label: 'Or', color: 'bg-yellow-100 text-yellow-700' },
  platine: { label: 'Platine', color: 'bg-purple-100 text-purple-700' },
};

export function LoyaltyTab() {
  const [copied, setCopied] = useState(false);

  const { data: loyalty, isLoading } = useQuery({
    queryKey: ['loyalty'],
    queryFn: async () => (await api.get<LoyaltyAccount>('/auth/loyalty')).data,
  });

  const { data: myCode } = useQuery({
    queryKey: ['referral-code'],
    queryFn: async () => (await api.get<{ code: string }>('/auth/referral/my-code')).data,
  });

  const { data: referrals } = useQuery({
    queryKey: ['referrals'],
    queryFn: async () => (await api.get<Referral[]>('/auth/referral/mine')).data,
  });

  function copyCode() {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading || !loyalty) return <p className="text-gray-400">Chargement...</p>;

  const tierInfo = TIER_LABELS[loyalty.tier] || TIER_LABELS.bronze;

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Solde de points</p>
            <p className="text-3xl font-bold text-brand-600">{loyalty.pointsBalance}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${tierInfo.color}`}>
            Niveau {tierInfo.label}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          1 point tous les 1000 FCFA dépensés, crédité à chaque livraison. {loyalty.lifetimePoints} points gagnés au total.
        </p>

        {loyalty.transactions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {loyalty.transactions.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.reason}</span>
                <span className="text-gray-400 text-xs">
                  +{t.points} · {formatDate(t.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <h2 className="font-semibold mb-1">Parraine tes proches</h2>
        <p className="text-sm text-gray-500 mb-3">
          Gagne 500 points de fidélité pour chaque ami qui passe sa première commande avec ton code.
        </p>

        {myCode && (
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono">
              {myCode.code}
            </code>
            <button
              onClick={copyCode}
              className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-3 py-2 rounded-lg"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        )}

        {referrals && referrals.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">{referrals.length} filleul(s)</p>
            {referrals.map((r) => (
              <div key={r.id} className="text-sm text-gray-600 py-1">
                {r.referred.firstName} — inscrit le {formatDate(r.referred.createdAt)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
