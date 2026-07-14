'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Page Catégories – frontend/app/categories/page.tsx
 *
 * Sidebar de catégories principales + grille de sous-catégories (style
 * Brainnel), branchée sur l'endpoint public existant
 * GET /products/meta/categories (product.routes.ts), qui renvoie déjà les
 * catégories racines avec leurs enfants.
 */

interface SubCategory {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
}

interface CategoryNode extends SubCategory {
  children: SubCategory[];
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<CategoryNode[]>('/products/meta/categories');
        if (cancelled) return;
        setCategories(data);
        setActiveId(data[0]?.id ?? null);
      } catch (err) {
        console.error('Erreur chargement catégories', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = categories.find((c) => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col bg-white md:h-screen">
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <button onClick={() => router.back()} aria-label="Retour">
          <ChevronLeft className="h-6 w-6 text-gray-800" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Catégories</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar catégories principales */}
        <nav className="w-28 flex-shrink-0 overflow-y-auto border-r border-gray-100 bg-gray-50 sm:w-32">
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse border-b border-gray-100 bg-gray-100" />
            ))}
          {categories.map((cat) => {
            const isActive = cat.id === activeId;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveId(cat.id)}
                className={`block w-full border-b border-gray-100 px-3 py-4 text-left text-sm leading-tight transition-colors ${
                  isActive ? 'border-l-4 border-l-brand-500 bg-white font-semibold text-brand-600' : 'text-gray-600'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </nav>

        {/* Grille de sous-catégories */}
        <main className="flex-1 overflow-y-auto px-3 py-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : active ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {/* La catégorie elle-même, pour voir tous ses produits sans filtrer par enfant */}
              <button
                onClick={() => router.push(`/products?categoryId=${active.id}`)}
                className="flex flex-col items-center gap-2 text-center"
              >
                <SubCategoryThumb name={active.name} iconUrl={active.iconUrl} />
                <span className="line-clamp-2 text-xs font-medium text-gray-900">Tout {active.name}</span>
              </button>
              {active.children.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => router.push(`/products?categoryId=${sub.id}`)}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <SubCategoryThumb name={sub.name} iconUrl={sub.iconUrl} />
                  <span className="line-clamp-2 text-xs text-gray-700">{sub.name}</span>
                </button>
              ))}
              {active.children.length === 0 && (
                <p className="col-span-3 mt-6 text-center text-sm text-gray-400">
                  Aucune sous-catégorie pour l&apos;instant
                </p>
              )}
            </div>
          ) : (
            <p className="mt-10 text-center text-sm text-gray-400">Aucune catégorie</p>
          )}
        </main>
      </div>
    </div>
  );
}

function SubCategoryThumb({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
        <Image src={iconUrl} alt={name} fill className="object-cover" sizes="120px" />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-brand-50 text-lg font-semibold text-brand-500">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
