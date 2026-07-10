'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatXof } from '@/lib/utils';

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  defaultMarginPercent: number | null;
  _count: { products: number };
}

interface SystemSettings {
  defaultMarginPercent: number | null;
}

interface MarginProduct {
  id: string;
  name: string;
  sku: string;
  status: string;
  costPriceCny: number | null;
  marginPercent: number;
  basePriceXof: number;
  salesCount: number;
  category: { id: string; name: string };
}

export default function AdminCategoriesPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<'categories' | 'products'>('categories');

  // Double protection : le backend refuse déjà (SUPER_ADMIN only) mais on évite
  // d'afficher la page à un ADMIN classique qui aurait tapé l'URL directement.
  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire (Super Admin).
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Catégories &amp; marges</h1>
      <p className="text-sm text-gray-500 mb-4">
        Un seul endroit pour tout ce qui touche aux marges : réglages par catégorie (s&apos;applique
        automatiquement à tout nouveau produit) et vérification/correction produit par produit.
      </p>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('categories')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === 'categories' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
          }`}
        >
          Par catégorie
        </button>
        <button
          onClick={() => setTab('products')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === 'products' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
          }`}
        >
          Vérifier par produit
        </button>
      </div>

      {tab === 'categories' ? <CategoriesTab /> : <ProductMarginsTab />}
    </div>
  );
}

function CategoriesTab() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [marginDrafts, setMarginDrafts] = useState<Record<string, string>>({});

  const { data: categories, isLoading } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => (await api.get<AdminCategory[]>('/admin/categories')).data,
  });

  const { data: settings } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data,
  });

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.post('/admin/categories', { name: newName.trim() });
    setNewName('');
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/admin/categories/${id}`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
  }

  async function saveMargin(id: string) {
    const raw = marginDrafts[id];
    const value = raw === '' || raw == null ? null : Number(raw);
    await api.patch(`/admin/categories/${id}`, { defaultMarginPercent: value });
    setMarginDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
  }

  async function remove(id: string) {
    setError(null);
    if (!confirm('Supprimer cette catégorie ?')) return;
    try {
      await api.delete(`/admin/categories/${id}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors de la suppression');
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {settings?.defaultMarginPercent != null ? (
          <>Sans marge propre à la catégorie, la marge système par défaut s&apos;applique ({settings.defaultMarginPercent}%, réglable dans Paramètres système).</>
        ) : (
          <span className="text-amber-600 font-medium">
            Aucune marge par défaut n&apos;est configurée : tout produit sans marge de catégorie ni marge
            explicite sera refusé à la création tant que tu n&apos;auras pas réglé une marge ici ou
            dans Paramètres système.
          </span>
        )}
      </p>

      <form onSubmit={addCategory} className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom de la nouvelle catégorie"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Ajouter
        </button>
      </form>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Produits</th>
                <th className="px-4 py-3">Marge automatique</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories?.map((cat) => {
                const draft = marginDrafts[cat.id];
                const displayValue = draft ?? (cat.defaultMarginPercent?.toString() ?? '');
                const isDirty = draft !== undefined;
                return (
                  <tr key={cat.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{cat.name}</td>
                    <td className="px-4 py-3 text-gray-500">{cat._count.products}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={displayValue}
                          onChange={(e) =>
                            setMarginDrafts((prev) => ({ ...prev, [cat.id]: e.target.value }))
                          }
                          placeholder={settings?.defaultMarginPercent != null ? `défaut ${settings.defaultMarginPercent}%` : 'non configuré'}
                          className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                        />
                        <span className="text-xs text-gray-400">%</span>
                        {isDirty && (
                          <button
                            onClick={() => saveMargin(cat.id)}
                            className="text-xs text-brand-600 font-medium hover:underline"
                          >
                            Enregistrer
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(cat.id, cat.isActive)}
                        className={`text-xs px-2 py-1 rounded-full ${
                          cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {cat.isActive ? 'Active' : 'Désactivée'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(cat.id)}
                        className="p-2 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function ProductMarginsTab() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [belowMargin, setBelowMargin] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMargin, setBulkMargin] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories', 'list-simple'],
    queryFn: async () => (await api.get<AdminCategory[]>('/admin/categories')).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'product-margins', categoryFilter, belowMargin],
    queryFn: async () =>
      (
        await api.get<{ items: MarginProduct[] }>('/admin/products/margins', {
          params: { categoryId: categoryFilter || undefined, belowMargin: belowMargin || undefined },
        })
      ).data,
  });

  async function saveMargin(id: string) {
    const value = drafts[id];
    if (value === undefined || value === '') return;
    await api.patch(`/admin/products/${id}/margin`, { marginPercent: Number(value) });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['admin', 'product-margins'] });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkMargin() {
    if (!bulkMargin || selected.size === 0) return;
    setMessage(null);
    try {
      const { data: result } = await api.patch('/admin/products/bulk-margin', {
        productIds: Array.from(selected),
        newMarginPercent: Number(bulkMargin),
      });
      setMessage(`✅ ${result.updatedCount} produit(s) mis à jour`);
      setSelected(new Set());
      setBulkMargin('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-margins'] });
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    }
  }

  async function applyMarginToCategory() {
    if (!bulkMargin || !categoryFilter) return;
    if (!confirm(`Appliquer ${bulkMargin}% à TOUS les produits de cette catégorie ?`)) return;
    setMessage(null);
    try {
      const { data: result } = await api.patch('/admin/products/bulk-margin', {
        categoryId: categoryFilter,
        newMarginPercent: Number(bulkMargin),
      });
      setMessage(`✅ ${result.updatedCount} produit(s) mis à jour`);
      setBulkMargin('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-margins'] });
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    }
  }

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vérifier &amp; corriger les marges</h1>
      <p className="text-sm text-gray-500 mb-6">
        Triés par marge la plus basse en premier — à vérifier en priorité. Édite une marge et
        clique &quot;Enregistrer&quot; pour recalculer le prix de vente automatiquement.
      </p>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Toutes les catégories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={belowMargin}
          onChange={(e) => setBelowMargin(e.target.value)}
          placeholder="Marge inférieure à (%)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
        />
      </div>

      {message && <div className="text-sm p-3 rounded-lg bg-gray-50 mb-4">{message}</div>}

      {/* Actions en masse */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500">
          {selected.size > 0 ? `${selected.size} sélectionné(s)` : 'Sélectionne des produits ou une catégorie'}
        </span>
        <input
          type="number"
          value={bulkMargin}
          onChange={(e) => setBulkMargin(e.target.value)}
          placeholder="Nouvelle marge (%)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
        />
        <button
          onClick={applyBulkMargin}
          disabled={selected.size === 0 || !bulkMargin}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
        >
          Appliquer à la sélection
        </button>
        {categoryFilter && (
          <button
            onClick={applyMarginToCategory}
            disabled={!bulkMargin}
            className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
          >
            Appliquer à toute la catégorie
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : items.length ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-4 py-3">Produit</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Coût</th>
                <th className="px-4 py-3">Marge</th>
                <th className="px-4 py-3">Prix vente</th>
                <th className="px-4 py-3">Ventes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const draft = drafts[p.id];
                const isDirty = draft !== undefined && draft !== '';
                const isLowMargin = p.marginPercent < 20;
                return (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-xs">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.category.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {p.costPriceCny ? `${p.costPriceCny} ¥` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isLowMargin && <AlertTriangle size={13} className="text-amber-500" />}
                        <input
                          type="number"
                          value={draft ?? p.marginPercent}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                        />
                        <span className="text-xs text-gray-400">%</span>
                        {isDirty && (
                          <button
                            onClick={() => saveMargin(p.id)}
                            className="text-xs text-brand-600 font-medium hover:underline"
                          >
                            Enregistrer
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatXof(p.basePriceXof)}</td>
                    <td className="px-4 py-3 text-gray-500">{p.salesCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">Aucun produit ne correspond à ces filtres.</p>
      )}
    </div>
  );
}
