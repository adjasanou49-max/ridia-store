'use client';

import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

interface PendingProduct {
  id: string;
  name: string;
  basePriceXof: number;
  stockQuantity: number;
  seller: { storeName: string };
  images: { url: string }[];
}

export default function AdminProductsPage() {
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin', 'products', 'pending'],
    queryFn: async () => (await api.get<PendingProduct[]>('/admin/products/pending')).data,
  });

  async function approve(id: string) {
    await api.patch(`/admin/products/${id}/approve`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'products', 'pending'] });
  }

  async function reject(id: string) {
    if (!confirm('Rejeter ce produit ?')) return;
    await api.patch(`/admin/products/${id}/reject`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'products', 'pending'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Produits en attente de review</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : products?.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-100 flex gap-4">
              {p.images?.[0] && (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <Image src={p.images[0].url} alt="" fill className="object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <p className="text-sm text-gray-500">{p.seller.storeName}</p>
                <p className="font-bold text-brand-600 mt-1">{formatXof(p.basePriceXof)}</p>
                <p className="text-xs text-gray-400">{p.stockQuantity} en stock</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => approve(p.id)}
                    className="px-3 py-1.5 bg-accent-500 text-white rounded-lg text-xs font-medium hover:bg-accent-600"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => reject(p.id)}
                    className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400">Aucun produit en attente. 🎉</p>
      )}
    </div>
  );
}
