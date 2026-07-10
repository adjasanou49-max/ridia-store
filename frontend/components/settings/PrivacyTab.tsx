'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface PrivacySettings {
  notifyByEmail: boolean;
  notifyByWhatsapp: boolean;
  marketingOptIn: boolean;
}

export function PrivacyTab({ initial }: { initial: PrivacySettings }) {
  const [settings, setSettings] = useState<PrivacySettings>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function toggle(key: keyof PrivacySettings) {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/auth/privacy', { [key]: updated[key] });
    } catch (err: any) {
      setSettings(settings); // rollback si erreur
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur de sauvegarde'}`);
    } finally {
      setSaving(false);
    }
  }

  const items: { key: keyof PrivacySettings; label: string; description: string }[] = [
    {
      key: 'notifyByEmail',
      label: 'Notifications par email',
      description: 'Confirmations de commande, expéditions, mises à jour de compte.',
    },
    {
      key: 'notifyByWhatsapp',
      label: 'Notifications par WhatsApp',
      description: 'Suivi de commande et alertes importantes via WhatsApp.',
    },
    {
      key: 'marketingOptIn',
      label: 'Communications marketing',
      description: 'Promotions, nouveautés et offres spéciales. Désactivé par défaut.',
    },
  ];

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-1">
      <h2 className="font-semibold mb-3">Préférences de confidentialité</h2>
      {message && <div className="text-sm p-3 rounded-lg bg-red-50 text-red-700 mb-2">{message}</div>}

      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between py-3 border-t border-gray-100 first:border-t-0"
        >
          <div className="pr-4">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-xs text-gray-500">{item.description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings[item.key]}
            disabled={saving}
            onClick={() => toggle(item.key)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
              settings[item.key] ? 'bg-brand-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                settings[item.key] ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
