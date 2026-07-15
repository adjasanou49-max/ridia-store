'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { PaginatedResult, UserRole } from '@/types';

interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Client',
  SELLER: 'Vendeur',
  ADMIN: 'Admin',
  PURCHASING_AGENT: "Agent d'achat",
  MARKETING_AGENT: 'Agent Marketing',
  SALES_AGENT: 'Agent Commercial',
  SUPER_ADMIN: 'Super Admin',
};

export default function AdminUsersPage() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: async () =>
      (await api.get<PaginatedResult<AdminUserRow>>('/admin/users', { params: { q: search || undefined } })).data,
  });

  async function promote(id: string, role: UserRole) {
    await api.patch(`/admin/users/${id}/role`, { role });
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  async function deactivate(id: string) {
    if (!confirm('Désactiver ce compte ?')) return;
    await api.patch(`/admin/users/${id}/deactivate`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Utilisateurs</h1>
      <p className="text-gray-500 mb-6 text-sm">
        {isSuperAdmin
          ? 'En tant que Super Admin, tu peux promouvoir un utilisateur en Admin ou Vendeur.'
          : "Seul un Super Admin peut changer le rôle d'un utilisateur."}
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par nom ou email..."
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      />

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Inscrit le</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">
                    {u.firstName} {u.lastName}
                    {!u.isActive && (
                      <span className="ml-2 text-xs text-red-500">(désactivé)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right space-x-2">
                      <select
                        value={u.role}
                        onChange={(e) => promote(u.id, e.target.value as UserRole)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {u.isActive && (
                        <button
                          onClick={() => deactivate(u.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100"
                        >
                          Désactiver
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
