'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface BlacklistedWord {
  id: string;
  word: string;
  createdAt: string;
}

export default function AiModerationPage() {
  const { isSuperAdmin } = useAuth();

  // Double protection : même si la sidebar cache déjà ce lien pour un ADMIN classique,
  // on re-vérifie ici. Le backend refuse de toute façon la requête (SUPER_ADMIN only).
  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire (Super Admin).
      </div>
    );
  }

  return <AiModerationContent />;
}

function AiModerationContent() {
  const queryClient = useQueryClient();
  const [newWord, setNewWord] = useState('');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<{ original: string; cleaned: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: words, isLoading } = useQuery({
    queryKey: ['admin', 'ai-blacklist'],
    queryFn: async () => (await api.get<BlacklistedWord[]>('/admin/ai/blacklist')).data,
  });

  async function addWord(e: React.FormEvent) {
    e.preventDefault();
    if (!newWord.trim()) return;
    await api.post('/admin/ai/blacklist', { word: newWord.trim() });
    setNewWord('');
    queryClient.invalidateQueries({ queryKey: ['admin', 'ai-blacklist'] });
  }

  async function removeWord(id: string) {
    await api.delete(`/admin/ai/blacklist/${id}`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'ai-blacklist'] });
  }

  async function runTest() {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const { data } = await api.post('/admin/ai/test-sanitize', { text: testText });
      setTestResult(data);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={22} className="text-brand-500" />
        <h1 className="text-2xl font-bold">Agent IA de modération</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Nettoie automatiquement chaque fiche produit (à la création, à l&apos;import en masse, et
        à chaque modification) pour ne jamais révéler le fournisseur ou la plateforme d&apos;origine
        au client. Visible uniquement par toi — jamais par les admins classiques.
      </p>

      {/* Liste noire */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 mb-6">
        <h2 className="font-semibold mb-3">Mots retirés automatiquement</h2>

        <form onSubmit={addWord} className="flex gap-2 mb-4">
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="Ajouter un mot ou une expression..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Ajouter
          </button>
        </form>

        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {words?.map((w) => (
              <span
                key={w.id}
                className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full"
              >
                {w.word}
                <button onClick={() => removeWord(w.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
            {words?.length === 0 && <p className="text-sm text-gray-400">Aucun mot dans la liste.</p>}
          </div>
        )}
      </div>

      {/* Test rapide */}
      <div className="bg-white p-5 rounded-xl border border-gray-100">
        <h2 className="font-semibold mb-3">Tester l&apos;agent</h2>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Colle un texte de description pour voir ce que l'agent en ferait..."
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <button
          onClick={runTest}
          disabled={testing || !testText.trim()}
          className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {testing ? 'Analyse...' : 'Tester'}
        </button>

        {testResult && (
          <div className="mt-4 space-y-2">
            <div className="bg-red-50 rounded-lg p-3 text-sm">
              <p className="text-xs text-red-500 font-medium mb-1">Avant</p>
              {testResult.original}
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-sm">
              <p className="text-xs text-green-600 font-medium mb-1">Après (ce que verra le client)</p>
              {testResult.cleaned}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
