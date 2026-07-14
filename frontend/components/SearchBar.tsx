'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search, X, Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';
import { useLanguage } from '@/lib/language';
import type { PaginatedResult, Product } from '@/types';

export function SearchBar({ mobile = false }: { mobile?: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageSearchLoading, setImageSearchLoading] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ferme le dropdown au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    // Debounce 300ms - évite une requête à chaque frappe
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get<PaginatedResult<Product>>('/products', {
          params: { q: value.trim(), pageSize: 6 },
        });
        setResults(data.items);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function goToProduct(slug: string) {
    setOpen(false);
    setQuery('');
    router.push(`/products/${slug}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      setOpen(false);
      router.push(`/products?q=${encodeURIComponent(query.trim())}`);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageSearchError(null);
    setImageSearchLoading(true);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const { data } = await api.post('/products/search-by-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      router.push(`/products?q=${encodeURIComponent(data.detectedQuery)}`);
    } catch (err: any) {
      setImageSearchError(err?.response?.data?.error || "Impossible d'analyser cette photo, réessaie.");
    } finally {
      setImageSearchLoading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  return (
    <div ref={containerRef} className={`relative ${mobile ? 'w-full' : 'flex-1 max-w-2xl'}`}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={t('search.placeholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-full pl-4 pr-24 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setOpen(false);
              }}
              className="absolute right-16 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
            id={`image-search-input-${mobile ? 'mobile' : 'desktop'}`}
          />
          <label
            htmlFor={`image-search-input-${mobile ? 'mobile' : 'desktop'}`}
            title="Rechercher avec une photo"
            className={`absolute right-9 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full cursor-pointer hover:bg-gray-200/70 ${
              imageSearchLoading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <Camera size={15} className="text-gray-500" />
          </label>
          <button
            type="submit"
            className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center bg-brand-500 hover:bg-brand-600 rounded-full text-white ${
              mobile ? 'w-7 h-7' : 'w-8 h-8'
            }`}
          >
            <Search size={mobile ? 13 : 15} />
          </button>
        </div>
      </form>

      {imageSearchError && (
        <p className="absolute top-full right-0 mt-1 w-48 text-xs text-red-600 bg-white border border-red-100 rounded-lg p-2 shadow-sm z-10">
          {imageSearchError}
        </p>
      )}

      {/* Dropdown d'aperçu - image + nom + prix, comme la barre de recherche Amazon */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 p-4">Recherche...</p>
          ) : results.length > 0 ? (
            <>
              {results.map((product) => {
                const image = product.images?.[0];
                return (
                  <button
                    key={product.id}
                    onClick={() => goToProduct(product.slug)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      {image ? (
                        <Image src={image.url} alt={product.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                          —
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 truncate">{product.name}</p>
                      <p className="text-sm font-semibold text-brand-600">
                        {formatXof(product.basePriceXof)}
                      </p>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={handleSubmit}
                className="w-full text-center text-sm text-brand-600 font-medium py-3 hover:bg-gray-50"
              >
                Voir tous les résultats pour &quot;{query}&quot; →
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400 p-4">Aucun produit trouvé pour &quot;{query}&quot;</p>
          )}
        </div>
      )}
    </div>
  );
}
