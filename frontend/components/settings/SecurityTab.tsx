'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function SecurityTab() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage('❌ Les mots de passe ne correspondent pas');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/auth/password', { currentPassword, newPassword });
      setMessage('✅ Mot de passe changé. Reconnexion nécessaire...');
      setTimeout(() => logout(), 1500);
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-4">
      <h2 className="font-semibold">Changer le mot de passe</h2>
      {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Mot de passe actuel</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Confirmer le nouveau mot de passe</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {saving ? 'Changement...' : 'Changer le mot de passe'}
      </button>
      <p className="text-xs text-gray-400">
        Changer ton mot de passe déconnecte tous tes appareils par sécurité.
      </p>
    </form>
  );
}
