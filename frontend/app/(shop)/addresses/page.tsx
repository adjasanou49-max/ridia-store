'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Star, Trash2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';
import type { Address } from '@/types';

interface AddressFormData {
  fullName: string;
  phone: string;
  country: string;
  city: string;
  district: string;
  streetLine1: string;
  streetLine2: string;
  landmark: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressFormData = {
  fullName: '',
  phone: '',
  country: 'Burkina Faso',
  city: '',
  district: '',
  streetLine1: '',
  streetLine2: '',
  landmark: '',
  isDefault: false,
};

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get<Address[]>('/addresses')).data,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['addresses'] });
    setShowForm(false);
    setEditingId(null);
  }

  async function setDefault(id: string) {
    await api.patch(`/addresses/${id}`, { isDefault: true });
    refresh();
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette adresse ?')) return;
    await api.delete(`/addresses/${id}`);
    refresh();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mes adresses</h1>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Nouvelle adresse
          </button>
        )}
      </div>

      {showForm && <AddressForm onDone={refresh} onCancel={() => setShowForm(false)} />}

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : addresses?.length ? (
        <div className="space-y-3">
          {addresses.map((addr) =>
            editingId === addr.id ? (
              <AddressForm
                key={addr.id}
                initial={addr}
                onDone={refresh}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={addr.id} className="bg-white p-4 rounded-xl border border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{addr.fullName}</p>
                      {addr.isDefault && (
                        <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                          Par défaut
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{addr.phone}</p>
                    <p className="text-sm text-gray-500">
                      {addr.streetLine1}
                      {addr.streetLine2 ? `, ${addr.streetLine2}` : ''}
                      {addr.landmark ? ` (${addr.landmark})` : ''}
                    </p>
                    <p className="text-sm text-gray-500">
                      {addr.district ? `${addr.district}, ` : ''}
                      {addr.city}, {addr.country}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!addr.isDefault && (
                      <button
                        onClick={() => setDefault(addr.id)}
                        title="Définir par défaut"
                        className="p-2 text-gray-400 hover:text-brand-600"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingId(addr.id)}
                      className="p-2 text-gray-400 hover:text-gray-700"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => remove(addr.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        !showForm && <p className="text-gray-400">Aucune adresse enregistrée.</p>
      )}
    </div>
  );
}

export function AddressForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Address;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AddressFormData>(
    initial
      ? {
          fullName: initial.fullName,
          phone: initial.phone,
          country: initial.country,
          city: initial.city,
          district: initial.district || '',
          streetLine1: initial.streetLine1,
          streetLine2: initial.streetLine2 || '',
          landmark: initial.landmark || '',
          isDefault: initial.isDefault,
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (initial) {
        await api.patch(`/addresses/${initial.id}`, form);
      } else {
        await api.post('/addresses', form);
      }
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-3 mb-4">
      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nom complet</label>
          <input
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Téléphone</label>
          <input
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+226 XX XX XX XX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Pays</label>
          <select
            required
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ville</label>
          <input
            required
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Quartier / secteur</label>
        <input
          value={form.district}
          onChange={(e) => setForm({ ...form, district: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Adresse (rue, avenue...)</label>
        <input
          required
          value={form.streetLine1}
          onChange={(e) => setForm({ ...form, streetLine1: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Complément (optionnel)</label>
        <input
          value={form.streetLine2}
          onChange={(e) => setForm({ ...form, streetLine2: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Point de repère (optionnel)</label>
        <input
          value={form.landmark}
          onChange={(e) => setForm({ ...form, landmark: e.target.value })}
          placeholder="Ex: près du marché central"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
        />
        Définir comme adresse par défaut
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <X size={14} /> Annuler
        </button>
      </div>
    </form>
  );
}
