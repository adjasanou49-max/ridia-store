'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Package, Upload, Wallet, ClipboardList, Store } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function SellerLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isSeller, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Un vendeur OU un admin peut accéder (l'admin peut superviser)
    if (!isLoading && (!user || (!isSeller && !isAdmin))) {
      router.replace('/');
    }
  }, [isLoading, user, isSeller, isAdmin, router]);

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Vérification des accès...</div>;
  }

  if (!user || (!isSeller && !isAdmin)) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
      <aside className="w-56 shrink-0 hidden md:block">
        <nav className="space-y-1 sticky top-24">
          <Link href="/seller/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <LayoutDashboard size={16} /> Tableau de bord
          </Link>
          <Link href="/seller/products" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Package size={16} /> Mes produits
          </Link>
          <Link href="/seller/orders" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <ClipboardList size={16} /> Commandes
          </Link>
          <Link href="/seller/store" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Store size={16} /> Ma boutique
          </Link>
          <Link href="/seller/imports" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Upload size={16} /> Import 1688 / Taobao
          </Link>
          <Link href="/seller/payouts" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Wallet size={16} /> Paiements
          </Link>
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
