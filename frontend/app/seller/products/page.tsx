'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Sparkles, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';
import type { Category, PaginatedResult, Product } from '@/types';

export default function SellerProductsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'products'],
    queryFn: async () => (await api.get<PaginatedResult<Product>>('/seller/products')).data,
  });

  function onCreated() {
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
  }

  function onEdited() {
    setEditingProduct(null);
    queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mes produits</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Annuler' : 'Nouveau produit'}
        </button>
      </div>

      {showForm && <CreateProductForm onCreated={onCreated} />}
      {editingProduct && (
        <EditProductForm product={editingProduct} onDone={onEdited} onCancel={() => setEditingProduct(null)} />
      )}

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : data?.items.length ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Produit</th>
                <th className="px-4 py-3">Prix</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 flex items-center gap-3">
                    {p.images?.[0] && (
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                        <Image src={p.images[0].url} alt="" fill className="object-cover" />
                      </div>
                    )}
                    <span className="font-medium">{p.name}</span>
                  </td>
                  <td className="px-4 py-3">{formatXof(p.basePriceXof)}</td>
                  <td className="px-4 py-3">{p.stockQuantity}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="text-gray-400 hover:text-brand-600 p-1"
                        title="Modifier"
                      >
                        <Pencil size={15} />
                      </button>
                      {p.status === 'ARCHIVED' ? (
                        <UnarchiveButton productId={p.id} />
                      ) : (
                        <>
                          <PriceIncreaseButton productId={p.id} currentPrice={p.basePriceXof} />
                          <ArchiveButton productId={p.id} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400 mt-6">Aucun produit pour le moment.</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    PENDING_REVIEW: 'bg-yellow-100 text-yellow-700',
    ACTIVE: 'bg-green-100 text-green-700',
    SUSPENDED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    DRAFT: 'Brouillon',
    PENDING_REVIEW: 'En attente de review',
    ACTIVE: 'En ligne',
    SUSPENDED: 'Suspendu',
    ARCHIVED: 'Archivé',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${map[status] || map.DRAFT}`}>
      {labels[status] || status}
    </span>
  );
}

function CreateProductForm({ onCreated }: { onCreated: () => void }) {
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/products/meta/categories')).data,
  });

  const [form, setForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    costPriceCny: '',
    marginPercent: '',
    stockQuantity: '',
    weight: '',
    imageUrl: '',
  });
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [priceTiers, setPriceTiers] = useState<{ minQuantity: string; pricePerUnitXof: string }[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addTier() {
    setPriceTiers((tiers) => [...tiers, { minQuantity: '', pricePerUnitXof: '' }]);
  }
  function updateTier(index: number, field: 'minQuantity' | 'pricePerUnitXof', value: string) {
    setPriceTiers((tiers) => tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }
  function removeTier(index: number) {
    setPriceTiers((tiers) => tiers.filter((_, i) => i !== index));
  }

  // Calcul en direct du prix de vente XOF - même formule que le backend
  // (ProductService.calculatePriceXof) : coûtCNY × taux × (1 + marge%), arrondi à 50 XOF.
  const CNY_TO_XOF_RATE = 90; // doit rester synchronisé avec CNY_TO_XOF_RATE côté backend
  const costCny = parseFloat(form.costPriceCny) || 0;
  const marginEntered = form.marginPercent !== '';
  const margin = parseFloat(form.marginPercent) || 0;
  const estimatedPriceXof =
    costCny > 0 && marginEntered
      ? Math.round((costCny * CNY_TO_XOF_RATE * (1 + margin / 100)) / 50) * 50
      : 0;

  const selectedCategoryName = categories?.find((c) => c.id === form.categoryId)?.name;
  const validImageUrl = /^https?:\/\/.+/i.test(form.imageUrl) && !imageLoadFailed;

  function updateImageUrl(url: string) {
    setImageLoadFailed(false);
    setForm({ ...form, imageUrl: url });
  }

  async function suggestCategory() {
    if (!form.name) return;
    setSuggestingCategory(true);
    try {
      const { data } = await api.post<{ categoryId: string; confidence: 'high' | 'low' }>(
        '/products/suggest-category',
        { name: form.name, description: form.description }
      );
      setForm((prev) => ({ ...prev, categoryId: data.categoryId }));
    } finally {
      setSuggestingCategory(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedTiers = priceTiers
      .filter((t) => t.minQuantity && t.pricePerUnitXof)
      .map((t) => ({ minQuantity: Number(t.minQuantity), pricePerUnitXof: Number(t.pricePerUnitXof) }));

    setSubmitting(true);
    try {
      await api.post('/products', {
        categoryId: form.categoryId,
        name: form.name,
        description: form.description,
        costPriceCny: form.costPriceCny ? Number(form.costPriceCny) : undefined,
        marginPercent: form.marginPercent ? Number(form.marginPercent) : undefined,
        stockQuantity: Number(form.stockQuantity),
        weight: form.weight ? Number(form.weight) : undefined,
        images: form.imageUrl ? [form.imageUrl] : [],
        priceTiers: parsedTiers.length ? parsedTiers : undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-2 items-start">
      {/* Formulaire */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-5 rounded-xl border border-gray-100 space-y-3"
      >
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">Catégorie</label>
              <button
                type="button"
                onClick={suggestCategory}
                disabled={!form.name || suggestingCategory}
                className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline disabled:opacity-40 disabled:no-underline"
              >
                <Sparkles size={12} />
                {suggestingCategory ? 'Analyse...' : 'Suggérer (IA)'}
              </button>
            </div>
            <select
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sélectionner...</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nom du produit</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            required
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Prix coûtant (CNY)</label>
            <input
              type="number"
              step="0.01"
              value={form.costPriceCny}
              onChange={(e) => setForm({ ...form, costPriceCny: e.target.value })}
              placeholder="ex: 25.50"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Marge (%) — optionnel</label>
            <input
              type="number"
              value={form.marginPercent}
              onChange={(e) => setForm({ ...form, marginPercent: e.target.value })}
              placeholder="hérite de la catégorie"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Stock</label>
            <input
              type="number"
              required
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Poids (kg)</label>
            <input
              type="number"
              step="0.01"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="ex: 0.5"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">URL image</label>
          <input
            required
            value={form.imageUrl}
            onChange={(e) => updateImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          {form.imageUrl && !validImageUrl && (
            <p className="text-xs text-red-500 mt-1">
              Image introuvable ou URL invalide — vérifie le lien.
            </p>
          )}
        </div>

        {/* Prix dégressif par quantité - CECI est visible du client (comme sur 1688/Taobao) */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="block text-sm font-medium">
                Prix dégressif par quantité <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <p className="text-xs text-gray-400">
                Ex: 1 pièce = {estimatedPriceXof > 0 ? formatXof(estimatedPriceXof) : '...'}, à
                partir de 2 pièces = moins cher/pièce. <strong>Visible par le client</strong>,
                comme sur 1688/Taobao/Pinduoduo.
              </p>
            </div>
            <button
              type="button"
              onClick={addTier}
              className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-3 py-1.5"
            >
              + Ajouter un palier
            </button>
          </div>

          {priceTiers.length > 0 && (
            <div className="space-y-2">
              {priceTiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 shrink-0">À partir de</span>
                  <input
                    type="number"
                    min={2}
                    placeholder="qté (ex: 2)"
                    value={tier.minQuantity}
                    onChange={(e) => updateTier(i, 'minQuantity', e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-gray-400 shrink-0">pièces →</span>
                  <input
                    type="number"
                    placeholder="prix/pièce XOF"
                    value={tier.pricePerUnitXof}
                    onChange={(e) => updateTier(i, 'pricePerUnitXof', e.target.value)}
                    className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? 'Création...' : 'Créer le produit'}
        </button>
        <p className="text-xs text-gray-400">
          Le produit sera soumis en statut &quot;En attente de review&quot; jusqu&apos;à validation admin.
        </p>
      </form>

      {/* Aperçu live - exactement ce que verra le CLIENT sur la fiche produit publique */}
      <div className="sticky top-24">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
          👁️ Aperçu — ce que le client voit
        </p>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="relative aspect-square bg-gray-100">
            {validImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview d'une URL externe non whitelistée dans next.config
              <img
                src={form.imageUrl}
                alt={form.name || 'Aperçu produit'}
                onError={() => setImageLoadFailed(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm text-center px-4">
                L&apos;image apparaîtra ici
              </div>
            )}
          </div>
          <div className="p-3">
            <p className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[2.5rem]">
              {form.name || 'Nom du produit'}
            </p>
            <p className="mt-2 font-bold text-brand-600">
              {estimatedPriceXof > 0 ? formatXof(estimatedPriceXof) : '— FCFA'}
              <span className="text-xs font-normal text-gray-400"> /pièce</span>
            </p>
            {selectedCategoryName && (
              <p className="text-xs text-gray-400 mt-1">{selectedCategoryName}</p>
            )}
          </div>

          {/* Tableau des paliers - PUBLIC, exactement comme sur 1688/Taobao/Pinduoduo */}
          {priceTiers.some((t) => t.minQuantity && t.pricePerUnitXof) && (
            <div className="border-t border-gray-100">
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-gray-50">
                    <td className="px-3 py-1.5 text-gray-500">1 pièce</td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {formatXof(estimatedPriceXof)}
                    </td>
                  </tr>
                  {priceTiers
                    .filter((t) => t.minQuantity && t.pricePerUnitXof)
                    .map((t, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-1.5 text-gray-500">à partir de {t.minQuantity} pcs</td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {formatXof(Number(t.pricePerUnitXof))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panneau coût/marge - PRIVÉ, jamais envoyé à l'API publique ni visible du client */}
        {costCny > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
              🔒 Visible par toi uniquement — jamais par le client
            </p>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Coût ({costCny} ¥ × {CNY_TO_XOF_RATE})</span>
                <span>{formatXof(costCny * CNY_TO_XOF_RATE)}</span>
              </div>
              <div className="flex justify-between">
                <span>Marge ({margin}%)</span>
                <span>+{formatXof(estimatedPriceXof - costCny * CNY_TO_XOF_RATE)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-700 border-t border-amber-200 pt-1">
                <span>Prix de vente (1 pièce)</span>
                <span>{formatXof(estimatedPriceXof)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArchiveButton({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  async function archive() {
    if (!confirm('Retirer ce produit de la vente ? Tu pourras le réactiver plus tard.')) return;
    setSubmitting(true);
    try {
      await api.delete(`/products/${productId}`);
      queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      onClick={archive}
      disabled={submitting}
      className="text-xs text-red-500 font-medium hover:underline disabled:opacity-50"
      title="Archiver (retirer de la vente)"
    >
      {submitting ? '...' : 'Archiver'}
    </button>
  );
}

function UnarchiveButton({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  async function unarchive() {
    setSubmitting(true);
    try {
      await api.patch(`/products/${productId}/unarchive`);
      queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      onClick={unarchive}
      disabled={submitting}
      className="text-xs text-brand-600 font-medium hover:underline disabled:opacity-50"
    >
      {submitting ? 'Réactivation...' : 'Réactiver'}
    </button>
  );
}

function PriceIncreaseButton({ productId, currentPrice }: { productId: string; currentPrice: number }) {
  const [open, setOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [hours, setHours] = useState('24');
  const [submitting, setSubmitting] = useState(false);

  async function schedule() {
    if (!newPrice) return;
    setSubmitting(true);
    try {
      const scheduledAt = new Date(Date.now() + Number(hours) * 3600_000).toISOString();
      await api.put(`/products/${productId}/schedule-price-increase`, {
        scheduledAt,
        newPriceXof: Number(newPrice),
      });
      setOpen(false);
      setNewPrice('');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-brand-600 font-medium hover:underline"
      >
        Programmer une hausse
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <input
        type="number"
        value={newPrice}
        onChange={(e) => setNewPrice(e.target.value)}
        placeholder={`> ${currentPrice}`}
        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs"
      />
      <select
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="border border-gray-300 rounded-lg px-1 py-1 text-xs"
      >
        <option value="1">1h</option>
        <option value="6">6h</option>
        <option value="24">24h</option>
        <option value="72">3 jours</option>
      </select>
      <button
        onClick={schedule}
        disabled={submitting || !newPrice}
        className="bg-brand-500 text-white text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40"
      >
        OK
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-400 text-xs">
        ✕
      </button>
    </div>
  );
}

function EditProductForm({
  product,
  onDone,
  onCancel,
}: {
  product: Product;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description,
    basePriceXof: String(product.basePriceXof),
    stockQuantity: String(product.stockQuantity),
    weight: product.weight ? String(product.weight) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/products/${product.id}`, {
        name: form.name,
        description: form.description,
        basePriceXof: Number(form.basePriceXof),
        stockQuantity: Number(form.stockQuantity),
        weight: form.weight ? Number(form.weight) : undefined,
      });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors de la modification');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-brand-200 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Modifier : {product.name}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Nom du produit</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          required
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Prix de vente (FCFA)</label>
          <input
            type="number"
            required
            value={form.basePriceXof}
            onChange={(e) => setForm({ ...form, basePriceXof: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Stock</label>
          <input
            type="number"
            required
            value={form.stockQuantity}
            onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Poids (kg)</label>
          <input
            type="number"
            step="0.01"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
      </button>

      <VariantsManager productId={product.id} />
    </form>
  );
}

function VariantsManager({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [newVariant, setNewVariant] = useState({ name: '', priceXof: '', stockQuantity: '', weightKg: '' });

  const { data: variants } = useQuery({
    queryKey: ['seller', 'variants', productId],
    queryFn: async () => (await api.get<any[]>(`/products/${productId}/variants`)).data,
  });

  async function addVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!newVariant.name || !newVariant.priceXof) return;
    await api.post(`/products/${productId}/variants`, {
      name: newVariant.name,
      priceXof: Number(newVariant.priceXof),
      stockQuantity: Number(newVariant.stockQuantity) || 0,
      weightKg: newVariant.weightKg ? Number(newVariant.weightKg) : undefined,
    });
    setNewVariant({ name: '', priceXof: '', stockQuantity: '', weightKg: '' });
    queryClient.invalidateQueries({ queryKey: ['seller', 'variants', productId] });
  }

  async function removeVariant(variantId: string) {
    await api.delete(`/products/variants/${variantId}`);
    queryClient.invalidateQueries({ queryKey: ['seller', 'variants', productId] });
  }

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <p className="text-sm font-medium mb-2">
        Variantes (tailles, couleurs) <span className="text-gray-400 font-normal">— optionnel</span>
      </p>

      {variants && variants.length > 0 && (
        <div className="space-y-1 mb-3">
          {variants.map((v) => (
            <div key={v.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
              <span>{v.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{formatXof(v.priceXof)}</span>
                <span className="text-xs text-gray-400">Stock: {v.stockQuantity}</span>
                {v.weightKg != null && <span className="text-xs text-gray-400">{v.weightKg} kg</span>}
                <button
                  type="button"
                  onClick={() => removeVariant(v.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newVariant.name}
          onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
          placeholder="Ex: Rouge - Taille M"
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          value={newVariant.priceXof}
          onChange={(e) => setNewVariant({ ...newVariant, priceXof: e.target.value })}
          placeholder="Prix"
          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          value={newVariant.stockQuantity}
          onChange={(e) => setNewVariant({ ...newVariant, stockQuantity: e.target.value })}
          placeholder="Stock"
          className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          step="0.01"
          value={newVariant.weightKg}
          onChange={(e) => setNewVariant({ ...newVariant, weightKg: e.target.value })}
          placeholder="Poids (kg)"
          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={addVariant}
          className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
        >
          + Ajouter
        </button>
      </div>
    </div>
  );
}
