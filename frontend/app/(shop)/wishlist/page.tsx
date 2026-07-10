'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import type { WishlistItem } from '@/types';

export default function WishlistPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => (await api.get<WishlistItem[]>('/wishlist')).data,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mes favoris</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : data?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {data.map((item) => (
            <ProductCard key={item.id} product={item.product} />
          ))}
        </div>
      ) : (
        <p className="text-gray-400">
          Aucun favori pour le moment. Ajoute des produits en cliquant sur le cœur ❤️
        </p>
      )}
    </div>
  );
}
