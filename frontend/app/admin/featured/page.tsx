'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';
import type { PaginatedResult, Product } from '@/types';

/**
 * Page Mise en avant - frontend/app/admin/featured/page.tsx
 *
 * Levier principal de l'Agent Marketing : choisir quels produits actifs
 * apparaissent en avant sur l'accueil, sans toucher à leur prix ni à leur
 * statut de modération (ça reste le rôle de "Produits en attente de review").
 */
export default function AdminFeaturedPage() {
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: results, isLoading } = useQuery({
    queryKey: ['admin', 'products', 'search', query],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Product>>('/products', {
          params: { q: query || undefined, pageSize: 24 },
        })
      ).data,
  });

  const { data: featured } = useQuery({
    queryKey: ['admin', 'products', 'featured-list'],
    queryFn: async () =>
      (
        await api.get<PaginatedResult<Product>>('/products', {
          params: { isFeatured: true, pageSize: 50 },
        })
      ).data,
  });

  async function toggleFeatured(id: string, next: boolean) {
    await api.patch(`/admin/products/${id}/featured`, { isFeatured: next });
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
  }

  const featuredIds = new Set((featured?.items ?? []).map((p) => p.id));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Mise en avant</h1>
      <p className="text-sm text-gray-500 mb-6">
        Choisis les produits qui apparaissent en avant sur l&apos;accueil. Ça ne change ni leur
        prix ni leur statut de modération.
      </p>

      {featured && featured.items.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Star size={16} className="fill-brand-500 text-brand-500" /> Actuellement en avant (
            {featured.items.length})
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {featured.items.map((p) => (
              <ProductRow key={p.id} product={p} isFeatured onToggle={toggleFeatured} />
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit actif à mettre en avant..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : results && results.items.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.items
            .filter((p) => !featuredIds.has(p.id))
            .map((p) => (
              <ProductRow key={p.id} product={p} isFeatured={false} onToggle={toggleFeatured} />
            ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Aucun produit actif trouvé.</p>
      )}
    </div>
  );
}

function ProductRow({
  product,
  isFeatured,
  onToggle,
}: {
  product: Product;
  isFeatured: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
      {product.images?.[0] && (
        <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
          <Image src={product.images[0].url} alt="" fill className="object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{product.name}</p>
        <p className="text-xs text-brand-600 font-semibold">{formatXof(product.basePriceXof)}</p>
      </div>
      <button
        onClick={() => onToggle(product.id, !isFeatured)}
        className={`shrink-0 p-2 rounded-full ${
          isFeatured ? 'bg-brand-50 text-brand-500' : 'bg-gray-50 text-gray-300 hover:text-gray-400'
        }`}
        title={isFeatured ? 'Retirer de la mise en avant' : 'Mettre en avant'}
      >
        <Star size={16} className={isFeatured ? 'fill-brand-500' : ''} />
      </button>
    </div>
  );
}
