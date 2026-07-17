'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import type { Category, PaginatedResult, Product } from '@/types';

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-gray-400">Chargement...</div>}>
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('categoryId') || undefined;
  const initialQuery = searchParams.get('q') || '';

  // key force un état frais (query/sortBy) à chaque nouvelle recherche lancée depuis la
  // navbar, même si on est déjà sur /products - sans ça le champ resterait bloqué sur
  // l'ancienne valeur puisque Next.js réutilise le même composant entre navigations.
  return (
    <ProductsGrid key={`${categoryId ?? ''}:${initialQuery}`} categoryId={categoryId} initialQuery={initialQuery} />
  );
}

function ProductsGrid({ categoryId, initialQuery }: { categoryId?: string; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [sortBy] = useState('newest');
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/products/meta/categories')).data,
  });

  // Cherche la catégorie active (top-niveau ou enfant) pour connaître ses attributs filtrables
  const activeCategory = categories
    ?.flatMap((c) => [c, ...(c.children || [])])
    .find((c) => c.id === categoryId);
  const filterableAttributes = activeCategory?.attributes ?? [];

  const attributesKey = JSON.stringify(attributeFilters);

  const { data, isLoading, isError, error, refetch, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['products', { categoryId, query, sortBy, attributesKey }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<PaginatedResult<Product>>('/products', {
          params: {
            categoryId,
            q: query || undefined,
            sortBy,
            page: pageParam,
            pageSize: 24,
            attributes: Object.keys(attributeFilters).length ? attributesKey : undefined,
          },
        })
      ).data,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
  });

  // Sentinelle observée : dès qu'elle entre dans le viewport, on charge la page suivante.
  // C'est ce qui permet le défilement infini façon Amazon/Shein - de nouveaux produits
  // apparaissent automatiquement quand on arrive en bas, sans bouton "page suivante".
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' } // déclenche un peu avant d'atteindre le bas, pour un scroll fluide
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.pagination.total ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Filtres par attribut (couleur, taille...) - visibles quand la catégorie en définit */}
      {filterableAttributes.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {filterableAttributes.map((attr) => (
            <select
              key={attr.id}
              value={attributeFilters[attr.name] || ''}
              onChange={(e) =>
                setAttributeFilters((prev) => {
                  const next = { ...prev };
                  if (e.target.value) next[attr.name] = e.target.value;
                  else delete next[attr.name];
                  return next;
                })
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">{attr.name} (tous)</option>
              {attr.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ))}
          {Object.keys(attributeFilters).length > 0 && (
            <button
              onClick={() => setAttributeFilters({})}
              className="text-sm text-gray-400 hover:text-red-500 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 lg:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        // Avant ce correctif, une erreur réseau/API tombait silencieusement dans le même
        // "Aucun produit trouvé" qu'un catalogue vraiment vide - impossible à distinguer
        // pour l'utilisateur (et invisible pour nous en train de déboguer à distance).
        <div className="text-center py-16">
          <p className="text-red-500 mb-3">
            Impossible de charger les produits
            {error instanceof Error ? ` (${error.message})` : ''}.
          </p>
          <button
            onClick={() => refetch()}
            className="text-brand-600 font-medium hover:underline"
          >
            Réessayer
          </button>
        </div>
      ) : items.length ? (
        <>
          {total > 0 && (
            <p className="text-sm text-gray-400 mb-3">{total} produits trouvés</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 lg:gap-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Sentinelle invisible - déclenche le chargement de la page suivante */}
          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 lg:gap-6 mt-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!hasNextPage && (
            <p className="text-center text-gray-300 text-sm py-8">
              Tu as vu tous les produits disponibles.
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-gray-500 py-16">Aucun produit trouvé.</p>
      )}
    </div>
  );
}
