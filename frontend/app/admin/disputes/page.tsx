'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';

interface DisputeItem {
  id: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
  order: { orderNumber: string; totalXof: number };
  user: { firstName: string; lastName: string; email: string };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Ouvert', color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  RESOLVED_REFUNDED: { label: 'Remboursé', color: 'bg-green-100 text-green-700' },
  RESOLVED_REJECTED: { label: 'Rejeté', color: 'bg-gray-100 text-gray-600' },
  CLOSED: { label: 'Fermé', color: 'bg-gray-100 text-gray-500' },
};

export default function AdminDisputesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const { data: disputes, isLoading } = useQuery({
    queryKey: ['admin', 'disputes', statusFilter],
    queryFn: async () =>
      (await api.get<DisputeItem[]>('/admin/disputes', { params: { status: statusFilter || undefined } })).data,
  });

  async function resolve(id: string, outcome: 'RESOLVED_REFUNDED' | 'RESOLVED_REJECTED') {
    if (!resolution.trim()) return;
    await api.patch(`/admin/disputes/${id}/resolve`, { resolution, outcome });
    setResolvingId(null);
    setResolution('');
    queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Litiges</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : disputes?.length ? (
        <div className="space-y-3">
          {disputes.map((d) => {
            const statusInfo = STATUS_LABELS[d.status] || STATUS_LABELS.OPEN;
            const resolvable = d.status === 'OPEN' || d.status === 'UNDER_REVIEW';
            return (
              <div key={d.id} className="bg-white p-4 rounded-xl border border-gray-100">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">
                      {d.order.orderNumber} — {d.reason}
                    </p>
                    <p className="text-xs text-gray-400">
                      {d.user.firstName} {d.user.lastName} ({d.user.email}) · {formatDate(d.createdAt)} ·{' '}
                      {formatXof(d.order.totalXof)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{d.description}</p>

                {resolvable && (
                  <>
                    {resolvingId === d.id ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          placeholder="Explication de la résolution..."
                          rows={2}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => resolve(d.id, 'RESOLVED_REFUNDED')}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                          >
                            Rembourser le client
                          </button>
                          <button
                            onClick={() => resolve(d.id, 'RESOLVED_REJECTED')}
                            className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                          >
                            Rejeter la demande
                          </button>
                          <button
                            onClick={() => setResolvingId(null)}
                            className="text-xs text-gray-400 px-2"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResolvingId(d.id)}
                        className="text-xs text-brand-600 font-medium hover:underline"
                      >
                        Traiter ce litige
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">Aucun litige. 🎉</p>
      )}
    </div>
  );
}
