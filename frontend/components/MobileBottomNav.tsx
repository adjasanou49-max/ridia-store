'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, ShoppingCart, Package, User } from 'lucide-react';
import { useCart } from '@/lib/cart';

const TABS = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/products', label: 'Catégories', icon: LayoutGrid },
  { href: '/cart', label: 'Panier', icon: ShoppingCart },
  { href: '/orders', label: 'Commandes', icon: Package },
  { href: '/account/settings', label: 'Compte', icon: User },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around py-1.5">
      {TABS.map((tab) => {
        const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 px-2 py-1 relative"
          >
            <div className="relative">
              <Icon size={20} className={isActive ? 'text-brand-600' : 'text-gray-400'} />
              {tab.href === '/cart' && itemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-brand-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] ${isActive ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
