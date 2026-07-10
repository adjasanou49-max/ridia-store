'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';

interface SellerOrderItem {
  id: string;
  productName: string;
  quantity: number;
  totalXof: number;
  status: string;
  trackingNumber?: string | null;
  product: { name: string; images: { url: string }[] };
  order: { orderNumber: string; createdAt: string };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED: { label: 'Confirmée', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'À préparer', color: 'bg-blue-100 text-blue-700' },
  SHIPPED: { label: 'Expédiée', color: 'bg-purple-100 text-purple-700' },
  DELIVERED: { label: 'Livrée', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Annulée', color: 'bg-gray-100 text-gray-600' },
};

export default function SellerOrdersPage() {
  const queryClient = useQueryClient();
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'orders'],
    queryFn: async () =>
      (await api.get<{ items: SellerOrderItem[] }>('/seller/orders')).data,
  });

  async function markShipped(orderItemId: string) {
    const trackingNumber = trackingInputs[orderItemId];
    if (!trackingNumber) return;
    await api.patch(`/seller/orders/${orderItemId}/ship`, { trackingNumber });
    queryClient.invalidateQueries({ queryKey: ['seller', 'orders'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mes commandes</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.PENDING;
            const canShip = item.status === 'CONFIRMED' || item.status === 'PROCESSING';
            return (
              <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-4">
                {item.product.images?.[0] && (
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    <Image src={item.product.images[0].url} alt="" fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.productName}</p>
                  <p className="text-xs text-gray-400">
                    Commande {item.order.orderNumber} · {formatDate(item.order.createdAt)} · Qté {item.quantity}
                  </p>
                  {item.trackingNumber && (
                    <p className="text-xs text-brand-600">Suivi: {item.trackingNumber}</p>
                  )}
                </div>
                <p className="font-bold shrink-0">{formatXof(item.totalXof)}</p>
                <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                {canShip && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      placeholder="N° de suivi"
                      value={trackingInputs[item.id] || ''}
                      onChange={(e) => setTrackingInputs({ ...trackingInputs, [item.id]: e.target.value })}
                      className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => markShipped(item.id)}
                      disabled={!trackingInputs[item.id]}
                      className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                    >
                      Expédier
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">Aucune commande pour le moment.</p>
      )}
    </div>
  );
}
