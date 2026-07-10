'use client';

import { useState } from 'react';
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

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const { data: privacy, isLoading: privacyLoading } = useQuery({
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
      {activeTab === 'privacy' &&
        (privacyLoading || !privacy ? (
          <p className="text-gray-400">Chargement...</p>
        ) : (
          <PrivacyTab initial={privacy} />
        ))}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'loyalty' && <LoyaltyTab />}
    </div>
  );
}
