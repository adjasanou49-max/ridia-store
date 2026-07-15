'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatXof, formatDate } from '@/lib/utils';

interface AgentPerformance {
  month: string;
  salesXof: number;
  orderCount: number;
  monthlyThresholdXof: number;
  thresholdMet: boolean;
  commissionPercent: number;
  commissionOwedXof: number;
}

interface AgentStats {
  code: string;
  commissionPercent: number;
  current: AgentPerformance;
  previous: AgentPerformance;
}

interface AgentOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalXof: number;
  createdAt: string;
  customerFirstName: string;
  productsSummary: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'bg-amber-50 text-amber-700' },
  CONFIRMED: { label: 'Confirmée', className: 'bg-blue-50 text-blue-700' },
  PROCESSING: { label: 'En préparation', className: 'bg-blue-50 text-blue-700' },
  SHIPPED: { label: 'Expédiée', className: 'bg-indigo-50 text-indigo-700' },
  DELIVERED: { label: 'Livrée', className: 'bg-green-50 text-green-700' },
  CANCELLED: { label: 'Annulée', className: 'bg-gray-100 text-gray-500' },
  REFUNDED: { label: 'Remboursée', className: 'bg-gray-100 text-gray-500' },
  DISPUTED: { label: 'Litige', className: 'bg-red-50 text-red-700' },
};

export default function SalesAgentDashboardPage() {
  const { user, isLoading: authLoading, isSalesAgent } = useAuth();
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['sales-agent', 'me', 'stats'],
    queryFn: async () => (await api.get<AgentStats>('/sales-agent/me/stats')).data,
    enabled: isSalesAgent,
  });

  const { data: orders } = useQuery({
    queryKey: ['sales-agent', 'me', 'orders', page],
    queryFn: async () =>
      (await api.get<{ items: AgentOrder[]; total: number; page: number; pageSize: number }>(
        '/sales-agent/me/orders',
        { params: { page, pageSize: 20 } }
      )).data,
    enabled: isSalesAgent,
  });

  if (authLoading || isLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">Chargement...</div>;
  }

  if (!user || !isSalesAgent) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">
        Cette page est réservée aux agents commerciaux.
      </div>
    );
  }

  if (!stats) return null;

  function copyCode() {
    navigator.clipboard.writeText(stats!.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const progressPercent = stats.current.monthlyThresholdXof
    ? Math.min(100, Math.round((stats.current.salesXof / stats.current.monthlyThresholdXof) * 100))
    : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Bonjour {user.firstName}</h1>
      <p className="text-sm text-gray-500 mb-6">Ton espace agent commercial Ridia Store.</p>

      {/* Code de tracking */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 mb-4">
        <p className="text-sm font-semibold mb-1">Ton code</p>
        <p className="text-xs text-gray-500 mb-3">
          Transmets-le à tes clients : à saisir dans le champ &quot;Code agent&quot; au moment de
          payer. Ça n&apos;offre aucune réduction au client - ça t&apos;attribue simplement la
          vente.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono">
            {stats.code}
          </code>
          <button
            onClick={copyCode}
            className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      </div>

      {/* Performance du mois en cours */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Ce mois-ci</p>
          {stats.current.thresholdMet && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
              <TrendingUp size={13} /> Seuil atteint
            </span>
          )}
        </div>

        <p className="text-3xl font-bold mb-1">{formatXof(stats.current.salesXof)}</p>
        <p className="text-xs text-gray-400 mb-3">
          {stats.current.orderCount} commande(s) apportée(s)
        </p>

        {stats.current.monthlyThresholdXof > 0 && (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 mb-1">
              <div
                className={`h-full rounded-full ${stats.current.thresholdMet ? 'bg-green-500' : 'bg-brand-500'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Seuil : {formatXof(stats.current.monthlyThresholdXof)}/mois pour débloquer{' '}
              {stats.current.commissionPercent}% de commission
            </p>
          </>
        )}

        <div className="rounded-lg bg-brand-50 px-3 py-3 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Commission due ce mois</p>
          <p className="text-xl font-bold text-brand-600">{formatXof(stats.current.commissionOwedXof)}</p>
        </div>
      </div>

      {/* Mois précédent, pour comparer */}
      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <p className="text-sm font-semibold mb-3">Mois précédent</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Ventes apportées</span>
          <span className="font-semibold">{formatXof(stats.previous.salesXof)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-gray-500">Commission gagnée</span>
          <span className="font-semibold text-brand-600">{formatXof(stats.previous.commissionOwedXof)}</span>
        </div>
      </div>

      {/* Historique des ventes attribuées */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 mt-4">
        <p className="text-sm font-semibold mb-3">Mes ventes</p>
        {orders && orders.items.length > 0 ? (
          <>
            <div className="space-y-2">
              {orders.items.map((o) => {
                const status = STATUS_LABELS[o.status] ?? { label: o.status, className: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.customerFirstName} — {o.productsSummary}</p>
                      <p className="text-xs text-gray-400">
                        {o.orderNumber} · {formatDate(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="text-sm font-semibold w-20 text-right">{formatXof(o.totalXof)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {orders.total > orders.pageSize && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30"
                >
                  <ChevronLeft size={14} /> Précédent
                </button>
                <span className="text-xs text-gray-400">
                  Page {page} / {Math.ceil(orders.total / orders.pageSize)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * orders.pageSize >= orders.total}
                  className="flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30"
                >
                  Suivant <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">Aucune vente pour l&apos;instant.</p>
        )}
      </div>
    </div>
  );
}
