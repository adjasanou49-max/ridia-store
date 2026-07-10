'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatXof, getUnitPriceForQuantity } from '@/lib/utils';
import { useCurrency } from '@/lib/currency';
import { AddressForm } from '../addresses/page';
import type { Address, PaymentProvider } from '@/types';

const PAYMENT_OPTIONS: { value: PaymentProvider; label: string; logo: string }[] = [
  { value: 'CINETPAY', label: 'CinetPay (Carte / Mobile Money)', logo: '💳' },
  { value: 'WAVE', label: 'Wave', logo: '🌊' },
  { value: 'ORANGE_MONEY', label: 'Orange Money', logo: '🟠' },
  { value: 'MTN_MONEY', label: 'MTN Mobile Money', logo: '💛' },
];

export default function CheckoutPage() {
  const { items, refresh } = useCart();
  const { currency, formatPrice } = useCurrency();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get<Address[]>('/addresses')).data,
  });

  const [shippingAddressId, setShippingAddressId] = useState('');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [customerName, setCustomerName] = useState(
    user ? `${user.firstName} ${user.lastName}` : ''
  );
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [provider, setProvider] = useState<PaymentProvider>('CINETPAY');
  const [couponCode, setCouponCode] = useState('');
  const [discountXof, setDiscountXof] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [usePoints, setUsePoints] = useState(false);

  const { data: loyalty } = useQuery({
    queryKey: ['loyalty'],
    queryFn: async () => (await api.get<{ pointsBalance: number }>('/auth/loyalty')).data,
  });

  const { data: paymentMethodsData } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await api.get<{ activeProviders: string[] }>('/products/meta/payment-methods')).data,
  });

  const availablePaymentOptions = PAYMENT_OPTIONS.filter((opt) =>
    paymentMethodsData ? paymentMethodsData.activeProviders.includes(opt.value) : true
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adresse effectivement sélectionnée : celle choisie manuellement, sinon la par défaut,
  // sinon la première disponible. Calculée au rendu - pas besoin d'effet pour ça.
  const defaultAddress = addresses?.find((a) => a.isDefault) ?? addresses?.[0];
  const effectiveAddressId = shippingAddressId || defaultAddress?.id || '';

  const subtotal = items.reduce((sum, item) => {
    const price = item.variant?.priceXof ?? getUnitPriceForQuantity(item.product, item.quantity);
    return sum + price * item.quantity;
  }, 0);

  async function applyCoupon() {
    setCouponError(null);
    setApplyingCoupon(true);
    try {
      const { data } = await api.post<{ discountXof: number }>('/orders/validate-coupon', {
        code: couponCode,
        subtotalXof: subtotal,
      });
      setDiscountXof(data.discountXof);
    } catch (err: any) {
      setCouponError(err?.response?.data?.error || 'Code promo invalide');
      setDiscountXof(0);
    } finally {
      setApplyingCoupon(false);
    }
  }

  // Dérivés au rendu - pas de useState/useEffect nécessaires. Les points ne
  // peuvent jamais dépasser ce qu'il reste à payer après la remise du coupon.
  const remainingAfterCoupon = Math.max(0, subtotal - discountXof);
  const pointsToRedeem = usePoints ? Math.min(loyalty?.pointsBalance ?? 0, remainingAfterCoupon) : 0;
  const totalDiscount = discountXof + pointsToRedeem;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!effectiveAddressId) {
      setError('Sélectionne ou ajoute une adresse de livraison');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/orders', {
        shippingAddressId: effectiveAddressId,
        paymentProvider: provider,
        customerPhone,
        customerName,
        couponCode: discountXof > 0 ? couponCode : undefined,
        pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
      });
      await refresh();

      if (data.paymentUrl) {
        // Redirection vers la page de paiement (CinetPay/Wave/etc.)
        window.location.href = data.paymentUrl;
      } else {
        router.push(`/orders/${data.order.id}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors de la commande');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Finaliser la commande</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

        {/* Adresse de livraison */}
        <div className="bg-white p-5 rounded-xl border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Adresse de livraison</h2>
            {!showAddressForm && (
              <button
                type="button"
                onClick={() => setShowAddressForm(true)}
                className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline"
              >
                <Plus size={14} /> Nouvelle adresse
              </button>
            )}
          </div>

          {showAddressForm && (
            <AddressForm
              onDone={() => {
                setShowAddressForm(false);
                queryClient.invalidateQueries({ queryKey: ['addresses'] });
              }}
              onCancel={() => setShowAddressForm(false)}
            />
          )}

          {addressesLoading ? (
            <p className="text-sm text-gray-400">Chargement des adresses...</p>
          ) : addresses?.length ? (
            <div className="space-y-2">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    effectiveAddressId === addr.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={effectiveAddressId === addr.id}
                    onChange={() => setShippingAddressId(addr.id)}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <p className="font-medium">
                      {addr.fullName} · {addr.phone}
                    </p>
                    <p className="text-gray-500">
                      {addr.streetLine1}
                      {addr.landmark ? ` (${addr.landmark})` : ''}, {addr.city}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            !showAddressForm && (
              <p className="text-sm text-gray-400">
                Aucune adresse enregistrée. Clique sur &quot;Nouvelle adresse&quot; pour en ajouter une.
              </p>
            )
          )}
        </div>

        {/* Contact */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-3">
          <h2 className="font-semibold">Contact pour la livraison</h2>
          <input
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nom complet"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Numéro de téléphone (WhatsApp)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Paiement */}
        <div className="bg-white p-5 rounded-xl border border-gray-100">
          <h2 className="font-semibold mb-3">Moyen de paiement</h2>
          <div className="space-y-2">
            {availablePaymentOptions.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                  provider === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  checked={provider === opt.value}
                  onChange={() => setProvider(opt.value)}
                />
                <span>{opt.logo}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Code promo */}
        <div className="bg-white p-5 rounded-xl border border-gray-100">
          <label className="block text-sm font-medium mb-2">Code promo (optionnel)</label>
          <div className="flex items-center gap-2">
            <input
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponError(null);
                setDiscountXof(0);
              }}
              placeholder="CODE"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
            />
            <button
              type="button"
              onClick={applyCoupon}
              disabled={!couponCode || applyingCoupon}
              className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
            >
              {applyingCoupon ? '...' : 'Appliquer'}
            </button>
          </div>
          {couponError && <p className="text-xs text-red-600 mt-2">{couponError}</p>}
          {discountXof > 0 && (
            <p className="text-xs text-green-600 mt-2">✅ Remise de {formatXof(discountXof)} appliquée</p>
          )}
        </div>

        {/* Points de fidélité */}
        {loyalty && loyalty.pointsBalance > 0 && (
          <div className="bg-white p-5 rounded-xl border border-gray-100">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
              />
              Utiliser mes {loyalty.pointsBalance} points de fidélité
              <span className="text-gray-400 font-normal">(1 point = 1 FCFA)</span>
            </label>
            {usePoints && (
              <p className="text-xs text-green-600 mt-2">
                ✅ {formatXof(pointsToRedeem)} de remise supplémentaire
              </p>
            )}
          </div>
        )}

        {/* Total */}
        <div className="bg-white p-5 rounded-xl border border-gray-100">
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-gray-500 mb-1">
              <span>Sous-total</span>
              <span>{formatXof(subtotal)}</span>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600 mb-1">
              <span>Remise</span>
              <span>-{formatXof(totalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatXof(subtotal - totalDiscount)}</span>
          </div>
          {currency !== 'XOF' && (
            <p className="text-xs text-gray-400 text-right mt-1">
              {formatPrice(subtotal - totalDiscount)} — le paiement s&apos;effectue toujours en FCFA
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || items.length === 0}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-full transition disabled:opacity-50"
        >
          {loading ? 'Traitement...' : 'Payer maintenant'}
        </button>
      </form>
    </div>
  );
}
