'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Zap } from 'lucide-react';
import { formatXof } from '@/lib/utils';
import type { Product } from '@/types';

// Fenêtre de vente flash quotidienne : se termine à minuit puis se relance le lendemain.
// (Présentation marketing simple ; pour de vraies ventes flash programmées, prévoir un
// modèle FlashSale en base avec dates de début/fin par le vendeur/admin.)
function useCountdownToMidnight() {
  function computeRemaining() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }

  const [remaining, setRemaining] = useState(computeRemaining);

  useEffect(() => {
    const interval = setInterval(() => setRemaining(computeRemaining()), 1000);
    return () => clearInterval(interval);
  }, []);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Estime un % "déjà vendu" à partir des ventes réelles vs stock restant, borné pour l'affichage. */
function estimateSoldPercent(product: Product): number {
  const total = product.salesCount + product.stockQuantity;
  if (total === 0) return 0;
  return Math.min(96, Math.max(8, Math.round((product.salesCount / total) * 100)));
}

export function FlashSaleSection({ products }: { products: Product[] }) {
  const countdown = useCountdownToMidnight();

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="fill-brand-500 text-brand-500" />
          <h2 className="text-lg font-bold">Ventes flash</h2>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium">
          <span className="text-gray-400">Se termine dans</span>
          <span className="bg-gray-900 text-white rounded px-2 py-0.5 font-mono text-xs">
            {countdown}
          </span>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {products.map((product) => {
          const image = product.images?.[0];
          const soldPercent = estimateSoldPercent(product);
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="shrink-0 w-32 md:w-40"
            >
              <div className="relative aspect-square rounded-lg bg-gray-100 overflow-hidden">
                {image && <Image src={image.url} alt={product.name} fill className="object-cover" />}
              </div>
              <p className="mt-1.5 text-sm font-bold text-brand-600">
                {formatXof(product.basePriceXof)}
              </p>
              <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-1">
                <div className="h-full bg-brand-500" style={{ width: `${soldPercent}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{soldPercent}% déjà vendu</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
