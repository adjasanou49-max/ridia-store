'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Check, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

interface InviteCode {
  id: string;
  code: string;
  intendedRole: 'ADMIN' | 'PURCHASING_AGENT' | 'SELLER' | 'MARKETING_AGENT' | 'SALES_AGENT';
  commissionPercent: number | null;
  monthlyThresholdXof: number | null;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export default function AdminInviteCodesPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire (Super Admin). Aucun admin classique ne peut
        générer de code d&apos;accès pour un autre admin.
      </div>
    );
  }

  return <InviteCodesContent />;
}

function InviteCodesContent() {
  const queryClient = useQueryClient();
  const [expiresInHours, setExpiresInHours] = useState('72');
  const [intendedRole, setIntendedRole] = useState<
    'ADMIN' | 'PURCHASING_AGENT' | 'SELLER' | 'MARKETING_AGENT' | 'SALES_AGENT'
  >('ADMIN');
  const [commissionPercent, setCommissionPercent] = useState('5');
  const [monthlyThresholdXof, setMonthlyThresholdXof] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: codes, isLoading } = useQuery({
    queryKey: ['admin', 'invite-codes'],
    queryFn: async () => (await api.get<InviteCode[]>('/admin/invite-codes')).data,
  });

  async function generate() {
    await api.post('/admin/invite-codes', {
      expiresInHours: Number(expiresInHours),
      intendedRole,
      ...(intendedRole === 'SALES_AGENT' && {
        commissionPercent: Number(commissionPercent),
        monthlyThresholdXof: monthlyThresholdXof ? Number(monthlyThresholdXof) : 0,
      }),
    });
    queryClient.invalidateQueries({ queryKey: ['admin', 'invite-codes'] });
  }

  async function revoke(id: string) {
    if (!confirm('Révoquer ce code ? Il ne pourra plus être utilisé.')) return;
    await api.delete(`/admin/invite-codes/${id}`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'invite-codes'] });
  }

  function copy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Codes d&apos;accès admin</h1>
      <p className="text-sm text-gray-500 mb-6">
        Génère un code à usage unique et transmets-le manuellement (email, WhatsApp) à la personne
        concernée — admin, agent d&apos;achat ou vendeur. Elle l&apos;active elle-même depuis son
        compte ; un compte vendeur reçoit automatiquement sa propre boutique (approuvée d&apos;office,
        puisqu&apos;invitée directement par toi).
      </p>

      <div className="bg-white p-4 rounded-xl border border-gray-100 mb-6 flex items-center gap-3">
        <label className="text-sm text-gray-600">Rôle</label>
        <select
          value={intendedRole}
          onChange={(e) =>
              setIntendedRole(
                e.target.value as 'ADMIN' | 'PURCHASING_AGENT' | 'SELLER' | 'MARKETING_AGENT' | 'SALES_AGENT'
              )
            }
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="ADMIN">Admin (accès large : produits, clients, avis...)</option>
          <option value="PURCHASING_AGENT">Agent d&apos;achat (uniquement les commandes fournisseur)</option>
          <option value="SELLER">Vendeur (sa propre boutique, ses produits, ses commandes)</option>
          <option value="MARKETING_AGENT">Agent Marketing (tableau de bord, codes promo, mise en avant produits)</option>
          <option value="SALES_AGENT">Agent Commercial (contrat de commission sur ses ventes apportées)</option>
        </select>
        {intendedRole === 'SALES_AGENT' && (
          <>
            <label className="text-sm text-gray-600">Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm"
            />
            <label className="text-sm text-gray-600">Seuil mensuel (FCFA)</label>
            <input
              type="number"
              min="0"
              step="1000"
              placeholder="ex: 600000"
              value={monthlyThresholdXof}
              onChange={(e) => setMonthlyThresholdXof(e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-2 py-2 text-sm"
            />
          </>
        )}
        <label className="text-sm text-gray-600">Expire dans</label>
        <select
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="24">24 heures</option>
          <option value="72">3 jours</option>
          <option value="168">7 jours</option>
        </select>
        <button
          onClick={generate}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Générer un code
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : codes?.length ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Expire le</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const isUsed = !!c.usedBy;
                const isExpired = new Date(c.expiresAt) < new Date();
                return (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono">{c.code}</td>
                    <td className="px-4 py-3 text-xs">
                      {c.intendedRole === 'PURCHASING_AGENT'
                        ? "Agent d'achat"
                        : c.intendedRole === 'SELLER'
                          ? 'Vendeur'
                          : c.intendedRole === 'MARKETING_AGENT'
                            ? 'Agent Marketing'
                            : c.intendedRole === 'SALES_AGENT'
                              ? `Agent Commercial (${c.commissionPercent}%, dès ${(c.monthlyThresholdXof ?? 0).toLocaleString('fr-FR')} FCFA/mois)`
                              : 'Admin'}
                    </td>
                    <td className="px-4 py-3">
                      {isUsed ? (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                          Utilisé le {formatDate(c.usedAt!)}
                        </span>
                      ) : isExpired ? (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">
                          Expiré
                        </span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          Disponible
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.expiresAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isUsed && !isExpired && (
                          <button
                            onClick={() => copy(c.code, c.id)}
                            className="text-gray-400 hover:text-brand-600 p-1"
                            title="Copier"
                          >
                            {copiedId === c.id ? <Check size={15} /> : <Copy size={15} />}
                          </button>
                        )}
                        {!isUsed && (
                          <button
                            onClick={() => revoke(c.id)}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Révoquer"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">Aucun code généré.</p>
      )}
    </div>
  );
}
