'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface SystemSettings {
  cnyToXofRate: number;
  defaultCommissionRate: number;
  defaultMarginPercent: number | null;
  displayCurrencyRates: Record<string, number>;
  enabledPaymentProviders: Record<string, boolean>;
  loyaltyPointsPerXof: number;
  loyaltyReferralBonusPoints: number;
  loyaltyTierThresholds: { tier: string; minPoints: number }[];
}

export default function AdminSettingsPage() {
  const { isSuperAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data,
    enabled: isSuperAdmin,
  });

  // Protection supplémentaire : même si la sidebar cache déjà ce lien pour un ADMIN
  // simple, on re-vérifie ici car un ADMIN pourrait taper l'URL directement.
  // Le backend refuse de toute façon la requête (authorize(SUPER_ADMIN) sur la route).
  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire (Super Admin).
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Paramètres système</h1>
      {isLoading || !data ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <SettingsForm initial={data} />
      )}
    </div>
  );
}

// Composant séparé : `initial` n'est utilisé que pour la valeur de départ de useState,
// ce composant n'est monté qu'une fois les données réellement disponibles (pas besoin
// d'effet pour synchroniser un state local avec des props qui arrivent plus tard).
function SettingsForm({ initial }: { initial: SystemSettings }) {
  const [form, setForm] = useState<SystemSettings>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencyRate, setNewCurrencyRate] = useState('');

  function addCurrency() {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || !newCurrencyRate) return;
    setForm({
      ...form,
      displayCurrencyRates: { ...form.displayCurrencyRates, [code]: Number(newCurrencyRate) },
    });
    setNewCurrencyCode('');
    setNewCurrencyRate('');
  }

  function removeCurrency(code: string) {
    const next = { ...form.displayCurrencyRates };
    delete next[code];
    setForm({ ...form, displayCurrencyRates: next });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/admin/settings', form);
      setMessage('✅ Paramètres mis à jour');
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-4 max-w-md">
      {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Taux de change CNY → XOF</label>
        <input
          type="number"
          step="0.01"
          value={form.cnyToXofRate}
          onChange={(e) => setForm({ ...form, cnyToXofRate: Number(e.target.value) })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">1 Yuan = {form.cnyToXofRate} FCFA</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Marge produit par défaut (%)</label>
        <input
          type="number"
          step="0.1"
          value={form.defaultMarginPercent ?? ''}
          onChange={(e) =>
            setForm({ ...form, defaultMarginPercent: e.target.value === '' ? null : Number(e.target.value) })
          }
          placeholder="non configuré"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">
          Appliquée à tout produit sans marge explicite, sauf si sa catégorie a sa propre marge
          définie dans <a href="/admin/categories" className="text-brand-600">Catégories</a>.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Commission vendeur par défaut (%)</label>
        <input
          type="number"
          step="0.1"
          value={form.defaultCommissionRate}
          onChange={(e) => setForm({ ...form, defaultCommissionRate: Number(e.target.value) })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">
          Part que Ridia Store retient sur chaque vente. Différent de la marge produit ci-dessus.
        </p>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-sm font-medium mb-1">Devises d&apos;affichage pour les clients</label>
        <p className="text-xs text-gray-400 mb-3">
          Le FCFA (XOF) reste toujours la devise de facturation réelle — mobile money et cartes
          sont débités en FCFA quel que soit l&apos;affichage. Ces taux ne servent qu&apos;à
          montrer une conversion approximative aux clients à l&apos;étranger.
        </p>
        {Object.entries(form.displayCurrencyRates).map(([code, rate]) => (
          <div key={code} className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium w-16">{code}</span>
            <input
              type="number"
              step="0.0001"
              value={rate}
              onChange={(e) =>
                setForm({
                  ...form,
                  displayCurrencyRates: { ...form.displayCurrencyRates, [code]: Number(e.target.value) },
                })
              }
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-xs text-gray-400 w-32">1 FCFA = {rate} {code}</span>
            <button
              type="button"
              onClick={() => removeCurrency(code)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <input
            value={newCurrencyCode}
            onChange={(e) => setNewCurrencyCode(e.target.value)}
            placeholder="Code (ex: XAF, KES, ZAR...)"
            maxLength={3}
            className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
          />
          <input
            type="number"
            step="0.0001"
            value={newCurrencyRate}
            onChange={(e) => setNewCurrencyRate(e.target.value)}
            placeholder="Taux (1 FCFA = ?)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCurrency}
            className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline shrink-0"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-sm font-medium mb-1">Programme de fidélité</label>
        <p className="text-xs text-gray-400 mb-3">
          Ces réglages s&apos;appliquent immédiatement aux prochaines commandes livrées et aux
          prochains parrainages - pas d&apos;effet rétroactif sur les points déjà attribués.
        </p>

        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">
            Points gagnés par FCFA dépensé (commande livrée)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">1 point / </span>
            <input
              type="number"
              step="1"
              min="1"
              value={form.loyaltyPointsPerXof > 0 ? Math.round(1 / form.loyaltyPointsPerXof) : ''}
              onChange={(e) => {
                const xofPerPoint = Number(e.target.value);
                setForm({
                  ...form,
                  loyaltyPointsPerXof: xofPerPoint > 0 ? 1 / xofPerPoint : 0,
                });
              }}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-xs text-gray-400">FCFA dépensés</span>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Bonus de parrainage (points offerts au parrain)</label>
          <input
            type="number"
            step="1"
            min="0"
            value={form.loyaltyReferralBonusPoints}
            onChange={(e) => setForm({ ...form, loyaltyReferralBonusPoints: Number(e.target.value) })}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-2">Paliers de fidélité (points cumulés à vie)</label>
          {form.loyaltyTierThresholds.map((t, i) => (
            <div key={t.tier} className="flex items-center gap-2 mb-2">
              <span className="text-sm w-16 capitalize">{t.tier}</span>
              <span className="text-xs text-gray-400">dès</span>
              <input
                type="number"
                step="1"
                min="0"
                value={t.minPoints}
                onChange={(e) => {
                  const next = [...form.loyaltyTierThresholds];
                  next[i] = { ...next[i], minPoints: Number(e.target.value) };
                  setForm({ ...form, loyaltyTierThresholds: next });
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <span className="text-xs text-gray-400">points</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Moyens de paiement activés</label>
        <div className="space-y-2">
          {Object.entries({
            WAVE: 'Wave',
            ORANGE_MONEY: 'Orange Money',
            MTN_MONEY: 'MTN Mobile Money',
            CUSTOM: 'Prestataire personnalisé',
          }).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabledPaymentProviders[key] ?? false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enabledPaymentProviders: { ...form.enabledPaymentProviders, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Un moyen désactivé ici disparaît immédiatement de l&apos;écran de paiement des clients. Les clés API de
          chaque prestataire restent configurées dans les variables d&apos;environnement du serveur.
        </p>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {saving ? 'Sauvegarde...' : 'Enregistrer'}
      </button>
    </form>
  );
}
