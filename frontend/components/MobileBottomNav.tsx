'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, MessageCircle, ShoppingCart, Package, User } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { useLanguage, TranslationKey } from '@/lib/language';

const TABS: { href: string; key: TranslationKey; icon: typeof Home }[] = [
  { href: '/', key: 'nav.home', icon: Home },
  { href: '/categories', key: 'nav.categories', icon: LayoutGrid },
  { href: '/support', key: 'nav.support', icon: MessageCircle },
  { href: '/cart', key: 'nav.cart', icon: ShoppingCart },
  { href: '/orders', key: 'nav.orders', icon: Package },
  { href: '/account', key: 'nav.account', icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { t } = useLanguage();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around py-1.5">
      {TABS.map((tab) => {
        const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 px-1.5 py-1 relative"
          >
            <div className="relative">
              <Icon size={19} className={isActive ? 'text-brand-600' : 'text-gray-400'} />
              {tab.href === '/cart' && itemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-brand-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </div>
            <span className={`text-[9.5px] leading-tight ${isActive ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
              {t(tab.key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
