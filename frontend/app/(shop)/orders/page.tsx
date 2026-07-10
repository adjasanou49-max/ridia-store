'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';
import type { Order, PaginatedResult } from '@/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED: { label: 'Confirmée', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'En préparation', color: 'bg-blue-100 text-blue-700' },
  SHIPPED: { label: 'Expédiée', color: 'bg-purple-100 text-purple-700' },
  DELIVERED: { label: 'Livrée', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Annulée', color: 'bg-gray-100 text-gray-600' },
  REFUNDED: { label: 'Remboursée', color: 'bg-gray-100 text-gray-600' },
  DISPUTED: { label: 'En litige', color: 'bg-red-100 text-red-700' },
};

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => (await api.get<PaginatedResult<Order>>('/orders')).data,
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mes commandes</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.PENDING;
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 hover:shadow-md transition"
              >
                <div>
                  <p className="font-semibold">{order.orderNumber}</p>
                  <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatXof(order.totalXof)}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">Aucune commande pour le moment.</p>
      )}
    </div>
  );
}
