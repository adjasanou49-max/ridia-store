'use client';

import { useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function DataTab() {
  const { logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const { data } = await api.get('/auth/export-data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ridia-store-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await api.delete('/auth/account');
      await logout();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erreur lors de la suppression');
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <h2 className="font-semibold mb-1">Exporter mes données</h2>
        <p className="text-sm text-gray-500 mb-4">
          Télécharge une copie complète de tes données personnelles (profil, commandes,
          adresses, notifications) au format JSON — conformément à ton droit d&apos;accès RGPD.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          <Download size={16} />
          {exporting ? 'Préparation...' : 'Télécharger mes données'}
        </button>
      </div>

      <div className="bg-white p-5 rounded-xl border border-red-100">
        <h2 className="font-semibold mb-1 flex items-center gap-2 text-red-700">
          <AlertTriangle size={18} /> Supprimer mon compte
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Cette action désactive immédiatement ton compte et anonymise tes informations
          personnelles (nom, email, téléphone). Tes commandes passées sont conservées de façon
          anonymisée pour nos obligations comptables. <strong>Cette action est irréversible.</strong>
        </p>

        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3">{error}</div>}

        <label className="block text-sm font-medium mb-1">
          Tape <span className="font-mono bg-gray-100 px-1 rounded">SUPPRIMER</span> pour confirmer
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />

        <button
          onClick={handleDelete}
          disabled={confirmText !== 'SUPPRIMER' || deleting}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? 'Suppression...' : 'Supprimer définitivement mon compte'}
        </button>
      </div>
    </div>
  );
}
