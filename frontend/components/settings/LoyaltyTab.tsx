'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatXof } from '@/lib/utils';

interface TierRung {
  tier: string;
  minPoints: number;
  discountPercent?: number;
}

interface LoyaltyAccount {
  pointsBalance: number;
  lifetimePoints: number;
  tier: string;
  currentDiscountPercent: number;
  xofPerPoint: number;
  tierLadder: TierRung[];
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

  // Grille triée du plus bas au plus haut palier, pour un affichage en escalier lisible.
  const ladderAsc = [...loyalty.tierLadder].sort((a, b) => a.minPoints - b.minPoints);
  const currentIndex = ladderAsc.findIndex((t) => t.tier === loyalty.tier);
  const nextTier = ladderAsc[currentIndex + 1];
  const pointsToNext = nextTier ? Math.max(0, nextTier.minPoints - loyalty.lifetimePoints) : 0;
  const xofToNext = pointsToNext * loyalty.xofPerPoint;

  return (
    <div className="space-y-4">
      {/* Palier actuel */}
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

        {loyalty.currentDiscountPercent > 0 && (
          <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
            🎁 -{loyalty.currentDiscountPercent}% appliqués automatiquement sur toutes tes commandes
          </div>
        )}

        <p className="text-xs text-gray-400">
          1 point tous les {formatXof(loyalty.xofPerPoint)} dépensés, crédité à chaque livraison. Tu as gagné{' '}
          {loyalty.lifetimePoints} points au total ({formatXof(loyalty.lifetimePoints * loyalty.xofPerPoint)}{' '}
          d&apos;achats cumulés).
        </p>

        {nextTier && (
          <p className="mt-3 text-xs text-gray-500">
            Il te reste <strong>{formatXof(xofToNext)}</strong> d&apos;achats ({pointsToNext} points) pour passer{' '}
            <strong>{TIER_LABELS[nextTier.tier]?.label ?? nextTier.tier}</strong> et débloquer{' '}
            {nextTier.discountPercent}% de réduction permanente.
          </p>
        )}

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

      {/* Grille des avantages par palier, du plus accessible au plus élevé */}
      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <h2 className="font-semibold mb-3">Tes avantages par palier</h2>
        <div className="space-y-2">
          {ladderAsc.map((rung) => {
            const info = TIER_LABELS[rung.tier] || TIER_LABELS.bronze;
            const isCurrent = rung.tier === loyalty.tier;
            return (
              <div
                key={rung.tier}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                  isCurrent ? 'border-brand-300 bg-brand-50' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${info.color}`}>{info.label}</span>
                  <span className="text-xs text-gray-500">
                    dès {formatXof(rung.minPoints * loyalty.xofPerPoint)} d&apos;achats
                  </span>
                </div>
                <span
                  className={`text-sm font-bold ${(rung.discountPercent ?? 0) > 0 ? 'text-brand-600' : 'text-gray-400'}`}
                >
                  {(rung.discountPercent ?? 0) > 0 ? `-${rung.discountPercent}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Parrainage */}
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
