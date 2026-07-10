'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';
import { ProductCard } from '@/components/ProductCard';
import { CategoryIconRow } from '@/components/CategoryIconRow';
import { FlashSaleSection } from '@/components/FlashSaleSection';
import type { Category, PaginatedResult, Product } from '@/types';

export default function HomePage() {
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/products/meta/categories')).data,
  });

  const { data: featured } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: async () =>
      (await api.get<PaginatedResult<Product>>('/products', { params: { pageSize: 8, sortBy: 'popular' } })).data,
  });

  const { data: flashSale } = useQuery({
    queryKey: ['products', 'flash-sale'],
    queryFn: async () =>
      (await api.get<PaginatedResult<Product>>('/products', { params: { pageSize: 6, sortBy: 'popular' } })).data,
  });

  // Petits prix - accroche le client dès son arrivée avec les articles les moins chers
  // du catalogue (comme Temu/Pinduoduo), affiché tout en haut de la page.
  const { data: cheapProducts } = useQuery({
    queryKey: ['products', 'cheap'],
    queryFn: async () =>
      (await api.get<PaginatedResult<Product>>('/products', { params: { pageSize: 8, sortBy: 'price_asc' } })).data,
  });

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-600 to-brand-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-20 text-center">
          <h1 className="text-2xl md:text-5xl font-bold mb-3">
            Mode Africaine &amp; Import direct de Chine
          </h1>
          <p className="text-base md:text-xl text-brand-50 mb-6 max-w-2xl mx-auto">
            Boubous, tissus wax, électronique et bien plus. Des milliers de produits,
            livrés où que vous soyez.
          </p>
          <Link
            href="/products"
            className="inline-block bg-white text-brand-700 font-semibold px-8 py-3 rounded-full hover:bg-brand-50 transition"
          >
            Découvrir les produits
          </Link>
        </div>
      </section>

      {/* Catégories */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        {categories && <CategoryIconRow categories={categories} />}
      </section>

      {/* Petits prix - accroche dès l'entrée, comme Temu/Pinduoduo */}
      {cheapProducts && cheapProducts.items.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              💸 Petits prix <span className="text-gray-400 font-normal text-sm">dès {formatXof(cheapProducts.items[0].basePriceXof)}</span>
            </h2>
            <Link href="/products?sortBy=price_asc" className="text-brand-600 text-sm font-medium hover:underline">
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
            {cheapProducts.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Ventes flash */}
      {flashSale && <FlashSaleSection products={flashSale.items} />}

      {/* Produits populaires */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Recommandé pour vous</h2>
          <Link href="/products" className="text-brand-600 text-sm font-medium hover:underline">
            Voir tout →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {featured?.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
