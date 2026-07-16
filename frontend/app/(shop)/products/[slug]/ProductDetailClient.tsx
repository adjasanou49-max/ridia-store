'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Star, ShoppingCart, ShieldCheck, Heart, Play, Weight } from 'lucide-react';
import { api } from '@/lib/api';
import { track } from '@vercel/analytics';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useWishlist } from '@/lib/wishlist';
import { useCurrency } from '@/lib/currency';
import { PriceIncreaseCountdown } from '@/components/PriceIncreaseCountdown';
import { VariantSelector } from '@/lib/variant-selector/VariantSelector';
import {
  mapRidiaVariantsToGeneric,
  RIDIA_PASSTHROUGH_MARGIN,
  RIDIA_PASSTHROUGH_CURRENCY,
} from '@/lib/variant-selector/ridia-adapter';
import { formatXof, formatDate, getUnitPriceForQuantity } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types';

export default function ProductDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const { currency, formatPrice } = useCurrency();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [adding, setAdding] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => (await api.get<Product>(`/products/${slug}`)).data,
  });

  async function handleAddToCart() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!product) return;
    setAdding(true);
    try {
      await addToCart(product.id, quantity, selectedVariant?.id);
      track('add_to_cart', {
        productId: product.id,
        productName: product.name,
        priceXof: selectedVariant?.priceXof ?? product.basePriceXof,
        quantity,
      });
      router.push('/cart');
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Chargement...</div>;
  }

  if (!product) {
    return <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Produit introuvable.</div>;
  }

  const images = product.images?.length ? product.images : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-10">
      {/* Images + vidéo */}
      <div>
        <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden mb-3">
          {showVideo && product.videoUrl ? (
            <video
              src={product.videoUrl}
              controls
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            images[selectedImage] && (
              <Image src={images[selectedImage].url} alt={product.name} fill className="object-cover" />
            )
          )}
        </div>
        {(images.length > 1 || product.videoUrl) && (
          <div className="flex gap-2">
            {product.videoUrl && (
              <button
                onClick={() => setShowVideo(true)}
                className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 bg-gray-900 flex items-center justify-center ${
                  showVideo ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <Play size={20} className="fill-white text-white" />
              </button>
            )}
            {images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => {
                  setShowVideo(false);
                  setSelectedImage(i);
                }}
                className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${
                  !showVideo && i === selectedImage ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <Image src={img.url} alt="" fill className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {user && (
            <button
              onClick={() => toggle(product.id)}
              aria-label={isWishlisted(product.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className="shrink-0 w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-red-200"
            >
              <Heart
                size={18}
                className={isWishlisted(product.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}
              />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Star size={16} className="fill-yellow-400 text-yellow-400" />
          <span>
            {product.rating.toFixed(1)} ({product.reviewCount} avis)
          </span>
          <span>·</span>
          <span>{product.salesCount} vendus</span>
        </div>

        <p className="text-3xl font-bold text-brand-600 mb-1">
          {formatXof(selectedVariant?.priceXof ?? getUnitPriceForQuantity(product, quantity))}
          <span className="text-base font-normal text-gray-400"> /pièce</span>
        </p>
        {currency !== 'XOF' && (
          <p className="text-sm text-gray-400 mb-1">{formatPrice(getUnitPriceForQuantity(product, quantity))}</p>
        )}
        {product.scheduledPriceIncreaseAt && product.priceAfterIncrease && (
          <div className="mb-4">
            <PriceIncreaseCountdown
              scheduledAt={product.scheduledPriceIncreaseAt}
              newPriceXof={product.priceAfterIncrease}
            />
          </div>
        )}
        {quantity > 1 && (
          <p className="text-sm text-gray-500 mb-4">
            Total pour {quantity} pièces :{' '}
            <span className="font-semibold">
              {formatXof(getUnitPriceForQuantity(product, quantity) * quantity)}
            </span>
          </p>
        )}

        {/* Tableau des prix dégressifs - visible du client, comme sur 1688/Taobao/Pinduoduo */}
        {product.priceTiers && product.priceTiers.length > 0 && (
          <div className="mb-4 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Quantité</th>
                  <th className="px-3 py-2 text-right font-medium">Prix / pièce</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  className={`border-t border-gray-200 ${
                    quantity < (product.priceTiers[0]?.minQuantity ?? Infinity) ? 'bg-brand-50 font-semibold' : ''
                  }`}
                >
                  <td className="px-3 py-2">1 pièce</td>
                  <td className="px-3 py-2 text-right">{formatXof(product.basePriceXof)}</td>
                </tr>
                {product.priceTiers.map((tier, i) => {
                  const nextTier = product.priceTiers![i + 1];
                  const isActive =
                    quantity >= tier.minQuantity && (!nextTier || quantity < nextTier.minQuantity);
                  return (
                    <tr
                      key={tier.id}
                      className={`border-t border-gray-200 ${isActive ? 'bg-brand-50 font-semibold' : ''}`}
                    >
                      <td className="px-3 py-2">
                        {tier.minQuantity}
                        {nextTier ? `–${nextTier.minQuantity - 1}` : '+'} pièces
                      </td>
                      <td className="px-3 py-2 text-right">{formatXof(tier.pricePerUnitXof)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded-lg">
          <ShieldCheck size={16} className="text-accent-600" />
          Vendu et expédié par Ridia Store
          {product.weight != null && (
            <>
              <span className="text-gray-300">·</span>
              <Weight size={15} className="text-gray-400" />
              <span>{product.weight} kg</span>
            </>
          )}
        </div>

        <p className="text-gray-700 whitespace-pre-line mb-6">{product.description}</p>

        {product.variants && product.variants.filter((v) => v.isActive).length > 0 && (
          <div className="mb-6">
            <VariantSelector
              variants={mapRidiaVariantsToGeneric(
                product.variants.filter((v) => v.isActive),
                product.weight ?? 0
              )}
              marginFormula={RIDIA_PASSTHROUGH_MARGIN}
              currency={RIDIA_PASSTHROUGH_CURRENCY}
              onVariantChange={(result) => {
                if (!result) {
                  setSelectedVariant(null);
                  return;
                }
                const matched = product.variants?.find((v) => v.id === result.variant.id) ?? null;
                setSelectedVariant(matched);
              }}
              classNames={{
                container: 'flex flex-col gap-4',
                group: 'flex flex-col gap-2',
                groupLabel: 'text-sm font-medium block',
                option:
                  'px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400 transition',
                optionSelected:
                  'px-3 py-2 rounded-lg border border-brand-500 bg-brand-50 text-brand-700 font-medium text-sm transition',
                optionDisabled:
                  'px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-300 line-through cursor-not-allowed',
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium">Quantité:</label>
          <div className="flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-1.5 hover:bg-gray-50"
            >
              -
            </button>
            <span className="px-4 py-1.5 border-x border-gray-300">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(product.stockQuantity, q + 1))}
              className="px-3 py-1.5 hover:bg-gray-50"
            >
              +
            </button>
          </div>
          <span className="text-sm text-gray-400">{product.stockQuantity} en stock</span>
        </div>

        {(() => {
          const activeVariants = product.variants?.filter((v) => v.isActive) ?? [];
          const needsVariant = activeVariants.length > 0 && !selectedVariant;
          return (
            <button
              onClick={handleAddToCart}
              disabled={adding || product.stockQuantity <= 0 || needsVariant}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-8 py-3 rounded-full transition disabled:opacity-50"
            >
              <ShoppingCart size={18} />
              {product.stockQuantity <= 0
                ? 'Rupture de stock'
                : needsVariant
                ? 'Choisis une option'
                : adding
                ? 'Ajout...'
                : 'Ajouter au panier'}
            </button>
          );
        })()}
      </div>
      </div>

      {/* Avis clients */}
      <ReviewsSection product={product} />
    </div>
  );
}

function ReviewsSection({ product }: { product: Product }) {
  const reviews = product.reviews ?? [];

  return (
    <div className="mt-12 border-t border-gray-100 pt-8">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold">Avis clients</h2>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Star size={15} className="fill-yellow-400 text-yellow-400" />
          <span className="font-medium text-gray-800">{product.rating.toFixed(1)}</span>
          <span>({product.reviewCount} avis)</span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="text-gray-400 text-sm">Aucun avis pour le moment.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {review.user?.firstName || review.authorName || 'Client'}
                </span>
                <span className="text-xs text-gray-400">{formatDate(review.createdAt)}</span>
              </div>
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}
                  />
                ))}
              </div>
              {review.comment && <p className="text-sm text-gray-600">{review.comment}</p>}
              {review.imageUrls?.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {review.imageUrls.map((url) => (
                    <div key={url} className="relative w-14 h-14 rounded-lg overflow-hidden bg-white">
                      <Image src={url} alt="" fill className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
