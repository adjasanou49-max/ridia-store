'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, Package, Store, Settings, ClipboardList, Tags, Sparkles, Ticket, AlertTriangle, KeyRound, Palette, PackageCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Double protection côté frontend (le backend refuse déjà les requêtes,
    // mais on évite d'afficher la page une fraction de seconde à un non-admin)
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/');
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading) {
    return <div className="text-center py-20 text-gray-400">Vérification des accès...</div>;
  }

  if (!user || !isAdmin) {
    return null; // redirection déjà déclenchée
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
      <aside className="w-56 shrink-0 hidden md:block">
        <nav className="space-y-1 sticky top-24">
          <Link href="/admin/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <LayoutDashboard size={16} /> Tableau de bord
          </Link>
          <Link href="/admin/sellers" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Store size={16} /> Vendeurs
          </Link>
          <Link href="/admin/products" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Package size={16} /> Produits
          </Link>
          <Link href="/admin/orders" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <ClipboardList size={16} /> Commandes
          </Link>
          <Link href="/admin/users" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <Users size={16} /> Utilisateurs
          </Link>
          <Link href="/admin/disputes" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <AlertTriangle size={16} /> Litiges
          </Link>
          <Link href="/agent" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
            <PackageCheck size={16} /> Commandes fournisseur
          </Link>
          {/* Réservé au SUPER_ADMIN uniquement - invisible pour les ADMIN classiques (employés) */}
          {isSuperAdmin && (
            <>
              <div className="pt-3 mt-3 border-t border-gray-100">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Propriétaire uniquement
                </p>
              </div>
              <Link href="/admin/categories" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <Tags size={16} /> Catégories &amp; marges
              </Link>
              <Link href="/admin/attributes" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <Palette size={16} /> Attributs de catégorie
              </Link>
              <Link href="/admin/coupons" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <Ticket size={16} /> Codes promo
              </Link>
              <Link href="/admin/invite-codes" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <KeyRound size={16} /> Codes d&apos;accès admin
              </Link>
              <Link href="/admin/ai-moderation" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <Sparkles size={16} /> Agent IA
              </Link>
              <Link href="/admin/settings" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100">
                <Settings size={16} /> Paramètres système
              </Link>
            </>
          )}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
