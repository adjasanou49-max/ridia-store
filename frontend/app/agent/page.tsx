'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface FulfillmentItem {
  id: string;
  productName: string;
  quantity: number;
  product: { sourceUrl: string | null; sourceProductId: string | null };
  variant: { name: string; attributes: Record<string, unknown> | null } | null;
  order: {
    orderNumber: string;
    createdAt: string;
    shippingAddress: {
      fullName: string;
      phone: string;
      country: string | null;
      city: string;
      streetLine1: string;
      streetLine2: string | null;
    };
  };
}

export default function OrderFulfillmentPage() {
  const queryClient = useQueryClient();
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [refDraft, setRefDraft] = useState('');

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin', 'order-fulfillment'],
    queryFn: async () => (await api.get<FulfillmentItem[]>('/order-fulfillment')).data,
  });

  async function markOrdered(orderItemId: string) {
    await api.post(`/order-fulfillment/${orderItemId}/mark-ordered`, {
      supplierOrderRef: refDraft || undefined,
    });
    setMarkingId(null);
    setRefDraft('');
    queryClient.invalidateQueries({ queryKey: ['admin', 'order-fulfillment'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Commandes à passer chez le fournisseur</h1>
      <p className="text-sm text-gray-500 mb-6">
        Clique le lien produit pour ouvrir la page d&apos;origine, commande manuellement, puis
        marque l&apos;article comme fait. Les commandes les plus anciennes apparaissent en premier.
      </p>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {item.productName}
                    {item.variant && <span className="text-gray-500"> — {item.variant.name}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Commande {item.order.orderNumber} · {formatDate(item.order.createdAt)} · Quantité :{' '}
                    <strong>{item.quantity}</strong>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Livrer à : {item.order.shippingAddress.fullName} ({item.order.shippingAddress.phone}) —{' '}
                    {item.order.shippingAddress.streetLine1}
                    {item.order.shippingAddress.streetLine2 ? `, ${item.order.shippingAddress.streetLine2}` : ''},{' '}
                    {item.order.shippingAddress.city}
                    {item.order.shippingAddress.country ? `, ${item.order.shippingAddress.country}` : ''}
                  </p>

                  {item.product.sourceUrl ? (
                    <a
                      href={item.product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline mt-2"
                    >
                      <ExternalLink size={12} /> Voir le produit sur la plateforme d&apos;origine
                    </a>
                  ) : (
                    <p className="text-xs text-orange-500 mt-2">
                      ⚠️ Pas de lien source enregistré pour ce produit (ajouté manuellement, pas via scraping)
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {markingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={refDraft}
                        onChange={(e) => setRefDraft(e.target.value)}
                        placeholder="Référence commande (optionnel)"
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-40"
                      />
                      <button
                        onClick={() => markOrdered(item.id)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                      >
                        Confirmer
                      </button>
                      <button onClick={() => setMarkingId(null)} className="text-xs text-gray-400 px-1">
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMarkingId(item.id)}
                      className="flex items-center gap-1 bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                    >
                      <Check size={13} /> Marquer comme commandé
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400">Aucune commande en attente d&apos;être passée chez le fournisseur. 🎉</p>
      )}
    </div>
  );
}
