'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PendingSeller {
  id: string;
  storeName: string;
  storeSlug: string;
  status: string;
  user: { email: string; firstName: string; lastName: string };
}

export default function AdminSellersPage() {
  const queryClient = useQueryClient();

  const { data: sellers, isLoading } = useQuery({
    queryKey: ['admin', 'sellers', 'pending'],
    queryFn: async () => (await api.get<PendingSeller[]>('/admin/sellers/pending')).data,
  });

  async function approve(id: string) {
    await api.patch(`/admin/sellers/${id}/approve`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'sellers', 'pending'] });
  }

  async function suspend(id: string) {
    const reason = prompt('Raison de la suspension ?');
    if (reason === null) return;
    await api.patch(`/admin/sellers/${id}/suspend`, { reason });
    queryClient.invalidateQueries({ queryKey: ['admin', 'sellers', 'pending'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vendeurs en attente d&apos;approbation</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : sellers?.length ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Boutique</th>
                <th className="px-4 py-3">Propriétaire</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{s.storeName}</td>
                  <td className="px-4 py-3">
                    {s.user.firstName} {s.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.user.email}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => approve(s.id)}
                      className="px-3 py-1.5 bg-accent-500 text-white rounded-lg text-xs font-medium hover:bg-accent-600"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => suspend(s.id)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600"
                    >
                      Rejeter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">Aucun vendeur en attente.</p>
      )}
    </div>
  );
}
