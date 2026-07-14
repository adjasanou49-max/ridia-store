'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { formatXof, getUnitPriceForQuantity } from '@/lib/utils';

export default function CartPage() {
  const { items, removeItem, addToCart, isLoading } = useCart();
  const router = useRouter();

  const subtotal = items.reduce((sum, item) => {
    const price = item.variant?.priceXof ?? getUnitPriceForQuantity(item.product, item.quantity);
    return sum + price * item.quantity;
  }, 0);

  // POST /orders/cart fixe la quantité exacte côté serveur (delta calculé en
  // interne) : on peut donc l'appeler directement pour +1/-1, pas besoin
  // d'une route dédiée.
  const updateQuantity = (
    productId: string,
    variantId: string | null | undefined,
    currentQty: number,
    delta: number
  ) => {
    const next = currentQty + delta;
    if (next < 1) return;
    addToCart(productId, next, variantId ?? undefined);
  };

  if (isLoading) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Chargement...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">Votre panier est vide.</p>
        <Link href="/products" className="text-brand-600 font-medium hover:underline">
          Découvrir les produits →
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Panier</h1>

        <div className="space-y-3">
          {items.map((item) => {
            const price = item.variant?.priceXof ?? getUnitPriceForQuantity(item.product, item.quantity);
            const image = item.variant?.imageUrl || item.product.images?.[0]?.url;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100"
              >
                <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {image && <Image src={image} alt="" fill className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{item.product.name}</p>
                  {item.variant?.name && (
                    <span className="inline-block mt-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                      {item.variant.name}
                    </span>
                  )}
                  <p className="font-bold text-brand-600 mt-1">{formatXof(price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.productId, item.variantId, item.quantity, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200"
                    aria-label="Diminuer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.variantId, item.quantity, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200"
                    aria-label="Augmenter"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-gray-400 hover:text-red-500 p-1.5"
                  aria-label="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bandeau total fixe */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 flex items-center gap-3 border-t border-gray-100 bg-white px-4 py-3 z-30">
        <div className="flex-1">
          <p className="text-xs text-gray-400">Sous-total</p>
          <p className="text-lg font-bold text-gray-900">{formatXof(subtotal)}</p>
        </div>
        <button
          onClick={() => router.push('/checkout')}
          className="rounded-full bg-brand-500 hover:bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white transition"
        >
          Passer la commande
        </button>
      </div>
    </div>
  );
}
