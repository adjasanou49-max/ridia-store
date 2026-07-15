'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Package,
  Store,
  Settings,
  ClipboardList,
  Tags,
  Sparkles,
  Ticket,
  AlertTriangle,
  KeyRound,
  Palette,
  PackageCheck,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/admin/sellers', label: 'Vendeurs', icon: Store },
  { href: '/admin/products', label: 'Produits', icon: Package },
  { href: '/admin/featured', label: 'Mise en avant', icon: Star },
  { href: '/admin/orders', label: 'Commandes', icon: ClipboardList },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/disputes', label: 'Litiges', icon: AlertTriangle },
  { href: '/agent', label: 'Commandes fournisseur', icon: PackageCheck },
];

// Réservé au SUPER_ADMIN uniquement - invisible pour les ADMIN classiques (employés)
const OWNER_NAV: NavItem[] = [
  { href: '/admin/categories', label: 'Catégories & marges', icon: Tags },
  { href: '/admin/attributes', label: 'Attributs de catégorie', icon: Palette },
  { href: '/admin/coupons', label: 'Codes promo', icon: Ticket },
  { href: '/admin/invite-codes', label: "Codes d'accès admin", icon: KeyRound },
  { href: '/admin/ai-moderation', label: 'Agent IA', icon: Sparkles },
  { href: '/admin/settings', label: 'Paramètres système', icon: Settings },
];

// Accès restreint : tableau de bord (lecture) + codes promo uniquement.
// Jamais vendeurs/produits/commandes/utilisateurs/litiges/paramètres.
const MARKETING_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/admin/featured', label: 'Mise en avant', icon: Star },
  { href: '/admin/coupons', label: 'Codes promo', icon: Ticket },
];

function NavLink({ item, active, mobile = false }: { item: NavItem; active: boolean; mobile?: boolean }) {
  const Icon = item.icon;
  if (mobile) {
    return (
      <Link
        href={item.href}
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
          active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        <Icon size={13} /> {item.label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
        active ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-100 text-gray-700'
      }`}
    >
      <Icon size={16} /> {item.label}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, hasAdminAccess, isSuperAdmin, isMarketingAgent } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Double protection côté frontend (le backend refuse déjà les requêtes,
    // mais on évite d'afficher la page une fraction de seconde à quelqu'un
    // sans aucun accès admin)
    if (!isLoading && (!user || !hasAdminAccess)) {
      router.replace('/');
    }
  }, [isLoading, user, hasAdminAccess, router]);

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Vérification des accès...</div>;
  }

  if (!user || !hasAdminAccess) {
    return null; // redirection déjà déclenchée
  }

  // L'Agent Marketing a un menu à part, volontairement très réduit -
  // tableau de bord + codes promo, rien d'autre.
  const allNav = isMarketingAgent ? MARKETING_NAV : isSuperAdmin ? [...MAIN_NAV, ...OWNER_NAV] : MAIN_NAV;
  const sidebarMain = isMarketingAgent ? MARKETING_NAV : MAIN_NAV;
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Nav mobile : barre horizontale défilante (absente avant, l'admin était
          inutilisable au téléphone en dehors de la page où on atterrissait) */}
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-2 md:hidden">
        {allNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} mobile />
        ))}
      </nav>

      <div className="flex gap-8">
        <aside className="w-56 shrink-0 hidden md:block">
          <nav className="space-y-1 sticky top-24">
            {sidebarMain.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
            {isSuperAdmin && (
              <>
                <div className="pt-3 mt-3 border-t border-gray-100">
                  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Propriétaire uniquement
                  </p>
                </div>
                {OWNER_NAV.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </>
            )}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
