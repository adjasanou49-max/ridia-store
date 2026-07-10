'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PackageCheck, LogOut } from 'lucide-react';

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin, isSuperAdmin, isPurchasingAgent, logout } = useAuth();
  const router = useRouter();

  const hasAccess = isAdmin || isSuperAdmin || isPurchasingAgent;

  useEffect(() => {
    if (!isLoading && (!user || !hasAccess)) {
      router.replace('/login');
    }
  }, [isLoading, user, hasAccess, router]);

  if (!user || !hasAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <PackageCheck size={18} className="text-brand-500" />
          Espace agent d&apos;achat
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500">
          <LogOut size={14} /> Déconnexion
        </button>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
