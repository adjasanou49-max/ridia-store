'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star, Heart } from 'lucide-react';
import { formatXof } from '@/lib/utils';
import { useCurrency } from '@/lib/currency';
import { useAuth } from '@/lib/auth';
import { useWishlist } from '@/lib/wishlist';
import { PriceIncreaseCountdown } from './PriceIncreaseCountdown';
import type { Product } from '@/types';

export function ProductCard({ product }: { product: Product }) {
  const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];
  const { user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const { currency, formatPrice } = useCurrency();
  const wishlisted = isWishlisted(product.id);

  function handleWishlistClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return; // silencieux - pas de redirection intrusive depuis une simple carte produit
    toggle(product.id);
  }

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition"
    >
      <div className="relative aspect-square bg-gray-100">
        {primaryImage ? (
          <Image
            src={primaryImage.url}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            Pas d&apos;image
          </div>
        )}
        {product.stockQuantity <= 0 && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            Rupture
          </span>
        )}
        {user && (
          <button
            onClick={handleWishlistClick}
            aria-label={wishlisted ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
          >
            <Heart
              size={15}
              className={wishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'}
            />
          </button>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </p>
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          {product.rating.toFixed(1)}
          {product.salesCount > 0 && <span>· {product.salesCount} vendus</span>}
        </div>
        <div className="mt-2">
          {product.priceTiers && product.priceTiers.length > 0 ? (
            <>
              <p className="font-bold text-brand-600">
                dès {formatXof(product.priceTiers[0].pricePerUnitXof)}
                <span className="text-xs font-normal text-gray-400">/pièce</span>
              </p>
              <p className="text-xs text-gray-400">
                1 pièce: {formatXof(product.basePriceXof)}
              </p>
            </>
          ) : (
            <p className="font-bold text-brand-600">{formatXof(product.basePriceXof)}</p>
          )}
          {currency !== 'XOF' && (
            <p className="text-xs text-gray-400">{formatPrice(product.basePriceXof)}</p>
          )}
          {product.scheduledPriceIncreaseAt && product.priceAfterIncrease && (
            <PriceIncreaseCountdown
              scheduledAt={product.scheduledPriceIncreaseAt}
              newPriceXof={product.priceAfterIncrease}
              compact
            />
          )}
        </div>
      </div>
    </Link>
  );
}
