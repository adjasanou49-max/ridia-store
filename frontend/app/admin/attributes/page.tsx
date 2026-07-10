'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface AdminCategory {
  id: string;
  name: string;
}

interface CategoryAttributeRow {
  id?: string;
  name: string;
  optionsText: string;
}

export default function AdminAttributesPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire (Super Admin).
      </div>
    );
  }

  return <AttributesContent />;
}

function AttributesContent() {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories', 'list-simple'],
    queryFn: async () => (await api.get<AdminCategory[]>('/admin/categories')).data,
  });

  const { data: allCategoriesWithAttributes, isLoading } = useQuery({
    queryKey: ['category-attributes'],
    queryFn: async () => (await api.get<any[]>('/products/meta/categories')).data,
    enabled: !!selectedCategoryId,
  });

  const match = allCategoriesWithAttributes
    ?.flatMap((c) => [c, ...(c.children || [])])
    .find((c) => c.id === selectedCategoryId);

  const initialRows: CategoryAttributeRow[] = (match?.attributes ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    optionsText: a.options.join(', '),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Attributs de catégorie</h1>
      <p className="text-sm text-gray-500 mb-6">
        Définis les options de filtre (Couleur, Taille...) pour chaque catégorie. Les vendeurs
        choisissent ensuite parmi ces valeurs pour chaque variante de leurs produits, et les
        clients peuvent filtrer les produits sur ces mêmes valeurs dans le catalogue.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">Catégorie</label>
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-sm"
        >
          <option value="">Sélectionner une catégorie...</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCategoryId &&
        (isLoading ? (
          <p className="text-gray-400 text-sm">Chargement...</p>
        ) : (
          // key force un état d'édition frais à chaque changement de catégorie -
          // pas besoin d'effet pour synchroniser les rows avec les données chargées.
          <AttributesEditor key={selectedCategoryId} categoryId={selectedCategoryId} initialRows={initialRows} />
        ))}
    </div>
  );
}

function AttributesEditor({
  categoryId,
  initialRows,
}: {
  categoryId: string;
  initialRows: CategoryAttributeRow[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<CategoryAttributeRow[]>(initialRows);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setRows((prev) => [...prev, { name: '', optionsText: '' }]);
  }

  function updateRow(index: number, field: 'name' | 'optionsText', value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const attributes = rows
        .filter((r) => r.name.trim() && r.optionsText.trim())
        .map((r) => ({
          name: r.name.trim(),
          options: r.optionsText
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
        }));

      await api.put(`/products/categories/${categoryId}/attributes`, { attributes });
      setMessage('✅ Attributs enregistrés');
      queryClient.invalidateQueries({ queryKey: ['category-attributes'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100">
      {message && <div className="text-sm p-3 rounded-lg bg-gray-50 mb-3">{message}</div>}

      <div className="space-y-3 mb-4">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={row.name}
              onChange={(e) => updateRow(index, 'name', e.target.value)}
              placeholder="Nom (ex: Couleur)"
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={row.optionsText}
              onChange={(e) => updateRow(index, 'optionsText', e.target.value)}
              placeholder="Options séparées par des virgules (ex: Rouge, Bleu, Vert)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={() => removeRow(index)} className="text-gray-400 hover:text-red-500 p-2">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={addRow}
          className="flex items-center gap-1 text-sm text-brand-600 font-medium hover:underline"
        >
          <Plus size={14} /> Ajouter un attribut
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 ml-auto"
        >
          <Save size={14} />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

