'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Settings, Wallet, Heart, Clock, MapPin, FileClock, Truck, PackageCheck, LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatXof } from '@/lib/utils';
import type { Order, PaginatedResult } from '@/types';

/**
 * Page d'accueil du compte – frontend/app/account/page.tsx
 * Nouvelle page servie par l'onglet "Compte" de la bottom nav (auparavant
 * pointé directement sur /account/settings). La page Réglages reste
 * accessible via l'icône engrenage en haut à droite.
 *
 * Palier de fidélité : les seuils par défaut ci-dessous reflètent les
 * valeurs par défaut de LoyaltyService (DEFAULT_TIER_THRESHOLDS). Si l'admin
 * les modifie dans /admin/settings, cet affichage reste une estimation —
 * seul le "tier" renvoyé par le serveur fait foi.
 */

interface TierRung {
  tier: string;
  minPoints: number;
  discountPercent?: number;
}

interface LoyaltyAccount {
  pointsBalance: number;
  lifetimePoints: number;
  tier: string;
  currentDiscountPercent: number;
  xofPerPoint: number;
  tierLadder: TierRung[];
}

interface WalletData {
  balanceXof: number;
}

const TIER_LABELS: Record<string, string> = { bronze: 'Bronze', argent: 'Argent', or: 'Or', platine: 'Platine' };

function getTierProgress(loyalty: LoyaltyAccount) {
  const ladderAsc = [...loyalty.tierLadder].sort((a, b) => a.minPoints - b.minPoints);
  const idx = ladderAsc.findIndex((t) => t.tier === loyalty.tier);
  const current = ladderAsc[Math.max(idx, 0)];
  const next = ladderAsc[idx + 1];
  if (!next) return { current, next: null, progressPercent: 100, pointsToNext: 0, xofToNext: 0 };
  const span = next.minPoints - current.minPoints;
  const progressPercent = Math.min(
    100,
    Math.round(((loyalty.lifetimePoints - current.minPoints) / span) * 100)
  );
  const pointsToNext = next.minPoints - loyalty.lifetimePoints;
  return { current, next, progressPercent, pointsToNext, xofToNext: pointsToNext * loyalty.xofPerPoint };
}

export default function AccountHomePage() {
  const { user } = useAuth();

  const { data: loyalty } = useQuery({
    queryKey: ['loyalty'],
    queryFn: async () => (await api.get<LoyaltyAccount>('/auth/loyalty')).data,
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: async () => (await api.get<WalletData>('/wallet')).data,
  });

  // pageSize élevé pour obtenir un compte par statut correct sur la première page ;
  // au-delà de 50 commandes actives les badges resteront approximatifs.
  const { data: orders } = useQuery({
    queryKey: ['orders-summary'],
    queryFn: async () => (await api.get<PaginatedResult<Order>>('/orders?pageSize=50')).data,
  });

  const counts = { unpaid: 0, toShip: 0, toReceive: 0, disputed: 0 };
  orders?.items.forEach((o) => {
    if (o.status === 'PENDING') counts.unpaid++;
    else if (o.status === 'CONFIRMED' || o.status === 'PROCESSING') counts.toShip++;
    else if (o.status === 'SHIPPED') counts.toReceive++;
    else if (o.status === 'DISPUTED') counts.disputed++;
  });

  const progress = loyalty ? getTierProgress(loyalty) : null;

  const orderShortcuts = [
    { key: 'unpaid', label: 'Impayé', icon: FileClock, count: counts.unpaid },
    { key: 'toShip', label: 'Expédier', icon: Truck, count: counts.toShip },
    { key: 'toReceive', label: 'Recevoir', icon: PackageCheck, count: counts.toReceive },
    { key: 'service', label: 'Service', icon: LifeBuoy, count: counts.disputed },
  ];

  const services = [
    { label: 'Favoris', icon: Heart, href: '/wishlist' },
    { label: 'Historique', icon: Clock, href: '/orders' },
    { label: 'Adresse', icon: MapPin, href: '/addresses' },
    { label: 'Réglages', icon: Settings, href: '/account/settings' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 overflow-hidden rounded-full bg-brand-100">
            {user?.avatarUrl && <Image src={user.avatarUrl} alt="Avatar" fill className="object-cover" sizes="56px" />}
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">
              {user ? `${user.firstName} ${user.lastName}` : '...'}
            </p>
          </div>
        </div>
        <Link href="/account/settings" aria-label="Paramètres">
          <Settings className="h-6 w-6 text-gray-500" />
        </Link>
      </div>

      {/* Carte palier de fidélité */}
      <section className="mb-4 rounded-2xl bg-white p-4 border border-gray-100">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-600">
            {TIER_LABELS[progress?.current.tier ?? 'bronze']}
            {loyalty && loyalty.currentDiscountPercent > 0 && (
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                -{loyalty.currentDiscountPercent}% sur tes commandes
              </span>
            )}
          </span>
          <Link href="/account/settings?tab=loyalty" className="text-xs text-gray-400">
            Avantages &gt;
          </Link>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress?.progressPercent ?? 0}%` }} />
        </div>
        {progress?.next && (
          <p className="mt-2 text-xs text-gray-500">
            Il te reste <strong>{formatXof(progress.xofToNext)}</strong> d&apos;achats pour passer{' '}
            {TIER_LABELS[progress.next.tier]} et débloquer {progress.next.discountPercent}% de réduction permanente
          </p>
        )}
      </section>

      {/* Carte solde */}
      <section className="mb-4 rounded-2xl bg-white p-4 border border-gray-100">
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
          <Wallet className="h-4 w-4" />
          SOLDE
        </div>
        <p className="mb-4 text-3xl font-bold text-gray-900">{wallet ? formatXof(wallet.balanceXof) : '...'}</p>
        <div className="flex gap-3">
          <Link
            href="/account/wallet"
            className="flex-1 rounded-full bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
          >
            + Recharger
          </Link>
          <Link
            href="/account/wallet"
            className="flex-1 rounded-full border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-700"
          >
            Détails
          </Link>
        </div>
      </section>

      {/* Raccourcis commandes */}
      <section className="mb-4 rounded-2xl bg-white p-4 border border-gray-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Mes Commandes</h2>
          <Link href="/orders" className="text-xs text-gray-400">
            Voir Tout &gt;
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {orderShortcuts.map(({ key, label, icon: Icon, count }) => (
            <Link key={key} href="/orders" className="relative flex flex-col items-center gap-1.5">
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
              <Icon className="h-6 w-6 text-gray-700" />
              <span className="text-xs text-gray-600">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mes Services */}
      <section className="rounded-2xl bg-white p-4 border border-gray-100">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Mes Services</h2>
        <div className="grid grid-cols-4 gap-2">
          {services.map(({ label, icon: Icon, href }) => (
            <Link key={label} href={href} className="flex flex-col items-center gap-1.5">
              <Icon className="h-6 w-6 text-gray-700" />
              <span className="text-xs text-gray-600">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
