'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

interface SellerStats {
  storeName: string;
  rating: number;
  totalRevenue: number;
  totalPayoutOwed: number;
  totalOrders: number;
  pendingOrders: number;
  productCount: number;
}

export default function SellerDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'dashboard'],
    queryFn: async () => (await api.get<SellerStats>('/seller/dashboard')).data,
  });

  if (isLoading) return <p className="text-gray-400">Chargement...</p>;
  if (!data) return null;

  const cards = [
    { label: 'Chiffre d\'affaires', value: formatXof(data.totalRevenue) },
    { label: 'À recevoir (payout)', value: formatXof(data.totalPayoutOwed) },
    { label: 'Commandes totales', value: data.totalOrders },
    { label: 'Commandes en attente', value: data.pendingOrders },
    { label: 'Produits en ligne', value: data.productCount },
    { label: 'Note moyenne', value: `${data.rating.toFixed(1)} ⭐` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{data.storeName}</h1>
      <p className="text-gray-500 mb-6">Tableau de bord vendeur</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white p-5 rounded-xl border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
