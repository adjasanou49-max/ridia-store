'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category } from '@/types';

interface ImportRow {
  url: string;
  name: string;
  description?: string;
  priceCny: number;
  categoryId: string;
  stockQuantity: number;
  marginPercent?: number;
  images?: string[];
  videoUrl?: string;
  sourceLanguage?: string;
  weight?: number;
}

interface ImportJob {
  id: string;
  source: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  createdAt: string;
}

const SOURCE_OPTIONS = [
  { value: 'ALIBABA_1688', label: '1688.com' },
  { value: 'TAOBAO', label: 'Taobao' },
  { value: 'PINDUODUO', label: 'Pinduoduo' },
  { value: 'CSV_UPLOAD', label: 'Fichier CSV' },
  { value: 'MANUAL', label: 'Saisie manuelle' },
];

export default function SellerImportsPage() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState('ALIBABA_1688');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [defaultMargin, setDefaultMargin] = useState('');
  const [sourceLang, setSourceLang] = useState('zh');
  const [rawInput, setRawInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/products/meta/categories')).data,
  });

  const { data: jobs } = useQuery({
    queryKey: ['seller', 'imports'],
    queryFn: async () => (await api.get<ImportJob[]>('/seller/imports')).data,
    refetchInterval: 5000, // poll pour voir la progression en direct
  });

  // Parse un texte simple "1 produit par ligne" : Nom | PrixCNY | Stock | URL(optionnel)
  function parseRows(): ImportRow[] {
    return rawInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, priceCny, stockQuantity, url, videoUrl, weight] = line.split('|').map((s) => s?.trim());
        return {
          name: name || 'Produit sans nom',
          priceCny: Number(priceCny) || 0,
          stockQuantity: Number(stockQuantity) || 0,
          url: url || '',
          videoUrl: videoUrl || undefined,
          weight: weight ? Number(weight) : undefined,
          categoryId: defaultCategoryId,
          marginPercent: defaultMargin ? Number(defaultMargin) : undefined,
          sourceLanguage: sourceLang,
        };
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rows = parseRows();
    if (rows.length === 0) {
      setError('Ajoute au moins une ligne de produit');
      return;
    }
    if (!defaultCategoryId) {
      setError('Sélectionne une catégorie par défaut');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/seller/imports', { source, rows });
      setRawInput('');
      queryClient.invalidateQueries({ queryKey: ['seller', 'imports'] });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erreur lors de l'import");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Import 1688 / Taobao / Pinduoduo</h1>
      <p className="text-gray-500 mb-6">
        Importe tes produits en masse. Le prix de vente XOF est calculé automatiquement :
        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded ml-1">
          prixCNY × taux × (1 + marge%)
        </span>
      </p>

      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-4 mb-8">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Catégorie par défaut</label>
            <select
              value={defaultCategoryId}
              onChange={(e) => setDefaultCategoryId(e.target.value)}
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
            <label className="block text-sm font-medium mb-1">Marge (%) — optionnel</label>
            <input
              type="number"
              value={defaultMargin}
              onChange={(e) => setDefaultMargin(e.target.value)}
              placeholder="hérite de la catégorie"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Langue d&apos;origine</label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="zh">Chinois (défaut 1688/Taobao)</option>
              <option value="en">Anglais</option>
              <option value="fr">Déjà en français (pas de traduction)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Produits (un par ligne :{' '}
            <span className="font-mono text-xs">Nom | PrixCNY | Stock | URL | VidéoURL | PoidsKg</span>)
          </label>
          <textarea
            rows={8}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={
              'Boubou wax homme XXL | 45.50 | 100 | https://1688.com/product/123 | https://1688.com/video/123.mp4 | 0.4\nSac à main cuir | 22 | 50 | https://1688.com/product/456 | | 0.8'
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            {parseRows().length} ligne(s) détectée(s) · Vidéo et poids optionnels (5ᵉ et 6ᵉ champs,
            laisser vide si inconnu) · Le nom et la description seront traduits automatiquement en
            français si la langue d&apos;origine sélectionnée n&apos;est pas déjà le français.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? 'Envoi...' : 'Lancer l\'import'}
        </button>
      </form>

      <CsvImportBlock source={source} defaultCategoryId={defaultCategoryId} defaultMargin={defaultMargin} sourceLang={sourceLang} />

      <h2 className="text-lg font-semibold mb-3">Historique des imports</h2>
      {jobs?.length ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Progression</th>
                <th className="px-4 py-3">Réussis / Échoués</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{job.source}</td>
                  <td className="px-4 py-3">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3">
                    {job.processedItems} / {job.totalItems}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-600">{job.successItems}</span> /{' '}
                    <span className="text-red-500">{job.failedItems}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">Aucun import pour le moment.</p>
      )}
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED: 'bg-gray-100 text-gray-600',
    RUNNING: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    PARTIALLY_COMPLETED: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${map[status] || map.QUEUED}`}>
      {status}
    </span>
  );
}

function CsvImportBlock({
  source,
  defaultCategoryId,
  defaultMargin,
  sourceLang,
}: {
  source: string;
  defaultCategoryId: string;
  defaultMargin: string;
  sourceLang: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ totalRows: number; jobCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', source);
      if (defaultCategoryId) formData.append('categoryId', defaultCategoryId);
      if (defaultMargin) formData.append('marginPercent', defaultMargin);
      formData.append('sourceLanguage', sourceLang);

      const { data } = await api.post('/seller/imports/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setFile(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erreur lors de l'import CSV");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100 mb-8">
      <h2 className="font-semibold mb-1">Import CSV — gros catalogues (jusqu&apos;à 1M+ produits)</h2>
      <p className="text-xs text-gray-400 mb-3">
        Colonnes attendues : <span className="font-mono">name,description,priceCny,stockQuantity,url,videoUrl,weight,categoryId,marginPercent,images</span>{' '}
        (images = plusieurs URLs séparées par <span className="font-mono">|</span>). Le fichier est
        automatiquement découpé en lots de 1000 et traité en arrière-plan — un seul upload suffit,
        même pour un catalogue de plusieurs centaines de milliers de lignes.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3">{error}</div>}
      {result && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-3">
          ✅ {result.totalRows} lignes reçues, découpées en {result.jobCount} lot(s) de traitement.
          Suis leur avancement dans l&apos;historique ci-dessous.
        </div>
      )}

      <form onSubmit={handleUpload} className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40 shrink-0"
        >
          {uploading ? 'Envoi...' : 'Importer le CSV'}
        </button>
      </form>
    </div>
  );
}
