'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { formatXof, getUnitPriceForQuantity } from '@/lib/utils';

export default function CartPage() {
  const { items, removeItem, isLoading } = useCart();
  const router = useRouter();

  const subtotal = items.reduce((sum, item) => {
    const price = item.variant?.priceXof ?? getUnitPriceForQuantity(item.product, item.quantity);
    return sum + price * item.quantity;
  }, 0);

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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mon panier</h1>

      <div className="space-y-4 mb-8">
        {items.map((item) => {
          const price = item.variant?.priceXof ?? getUnitPriceForQuantity(item.product, item.quantity);
          const image = item.product.images?.[0];
          return (
            <div
              key={item.id}
              className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100"
            >
              <div className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {image && <Image src={image.url} alt="" fill className="object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.product.name}</p>
                <p className="text-sm text-gray-500">Quantité: {item.quantity}</p>
                <p className="font-bold text-brand-600">{formatXof(price * item.quantity)}</p>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="text-gray-400 hover:text-red-500 p-2"
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100">
        <div className="flex justify-between text-lg font-bold mb-4">
          <span>Sous-total</span>
          <span>{formatXof(subtotal)}</span>
        </div>
        <p className="text-sm text-gray-500 mb-4">Frais de livraison calculés à l&apos;étape suivante.</p>
        <button
          onClick={() => router.push('/checkout')}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-full transition"
        >
          Passer la commande
        </button>
      </div>
    </div>
  );
}
