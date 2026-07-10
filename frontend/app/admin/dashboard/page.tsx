'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

interface DashboardStats {
  userCount: number;
  sellerCount: number;
  productCount: number;
  totalGMV: number;
  totalOrders: number;
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/admin/dashboard')).data,
  });

  const cards = [
    { label: 'Utilisateurs', value: data?.userCount ?? '—' },
    { label: 'Vendeurs approuvés', value: data?.sellerCount ?? '—' },
    { label: 'Produits actifs', value: data?.productCount ?? '—' },
    { label: 'Commandes totales', value: data?.totalOrders ?? '—' },
    { label: 'GMV total', value: data ? formatXof(data.totalGMV) : '—' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tableau de bord Admin</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-white p-5 rounded-xl border border-gray-100">
              <p className="text-sm text-gray-500 mb-1">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-white p-5 rounded-xl border border-gray-100">
        <h2 className="font-semibold mb-3">Actions rapides</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/admin/sellers" className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg font-medium hover:bg-brand-100">
            Vendeurs en attente d&apos;approbation
          </a>
          <a href="/admin/products" className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg font-medium hover:bg-brand-100">
            Produits en attente de review
          </a>
        </div>
      </div>
    </div>
  );
}
