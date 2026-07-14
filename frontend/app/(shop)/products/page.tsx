'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Camera } from 'lucide-react';
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
  const [sortBy, setSortBy] = useState('newest');
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

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
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
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tous les produits</h1>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full bg-gray-50 border border-gray-200 rounded-full pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
            <ImageSearchButton onResult={(detectedQuery) => setQuery(detectedQuery)} />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="newest">Plus récent</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
            <option value="popular">Popularité</option>
            <option value="rating">Mieux notés</option>
          </select>
        </div>
      </div>

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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length ? (
        <>
          {total > 0 && (
            <p className="text-sm text-gray-400 mb-3">{total} produits trouvés</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Sentinelle invisible - déclenche le chargement de la page suivante */}
          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
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

function ImageSearchButton({ onResult }: { onResult: (query: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const { data } = await api.post('/products/search-by-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onResult(data.detectedQuery);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Impossible d'analyser cette photo, réessaie.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        id="image-search-input"
      />
      <label
        htmlFor="image-search-input"
        title="Rechercher avec une photo"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full cursor-pointer hover:bg-gray-200/70 ${
          loading ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <Camera size={16} className="text-gray-500" />
      </label>
      {error && (
        <p className="absolute top-full right-0 mt-1 w-48 text-xs text-red-600 bg-white border border-red-100 rounded-lg p-2 shadow-sm z-10">
          {error}
        </p>
      )}
    </>
  );
}
