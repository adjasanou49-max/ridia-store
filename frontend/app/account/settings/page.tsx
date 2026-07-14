'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { User, Lock, ShieldCheck, Database, Gift } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { SecurityTab } from '@/components/settings/SecurityTab';
import { PrivacyTab } from '@/components/settings/PrivacyTab';
import { DataTab } from '@/components/settings/DataTab';
import { LoyaltyTab } from '@/components/settings/LoyaltyTab';

const TABS = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'security', label: 'Sécurité', icon: Lock },
  { id: 'privacy', label: 'Confidentialité', icon: ShieldCheck },
  { id: 'loyalty', label: 'Fidélité', icon: Gift },
  { id: 'data', label: 'Mes données', icon: Database },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isValidTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

function AccountSettingsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(isValidTab(initialTab) ? initialTab : 'profile');

  const {
    data: privacy,
    isLoading: privacyLoading,
    isError: privacyError,
    error: privacyErrorDetail,
    refetch: refetchPrivacy,
  } = useQuery({
    queryKey: ['privacy-settings'],
    queryFn: async () =>
      (await api.get<{ notifyByEmail: boolean; notifyByWhatsapp: boolean; marketingOptIn: boolean }>(
        '/auth/privacy'
      )).data,
    enabled: activeTab === 'privacy',
  });

  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Paramètres du compte</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'profile' && <ProfileTab user={user} />}
      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'privacy' && (
        <>
          {privacyLoading && <p className="text-gray-400">Chargement...</p>}
          {privacyError && (
            <div className="bg-white p-5 rounded-xl border border-red-100 text-sm">
              <p className="text-red-600 mb-2">
                Impossible de charger tes préférences de confidentialité
                {privacyErrorDetail instanceof Error ? ` (${privacyErrorDetail.message})` : ''}.
              </p>
              <button onClick={() => refetchPrivacy()} className="text-brand-600 font-medium hover:underline">
                Réessayer
              </button>
            </div>
          )}
          {!privacyLoading && !privacyError && privacy && <PrivacyTab initial={privacy} />}
        </>
      )}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'loyalty' && <LoyaltyTab />}
    </div>
  );
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<p className="text-gray-400">Chargement...</p>}>
      <AccountSettingsContent />
    </Suspense>
  );
}
