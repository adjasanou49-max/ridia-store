'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatXof } from '@/lib/utils';

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  usedCount: number;
  maxUses: number | null;
  isActive: boolean;
  expiresAt: string | null;
}

export default function AdminCouponsPage() {
  const { isSuperAdmin, isMarketingAgent } = useAuth();

  if (!isSuperAdmin && !isMarketingAgent) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire et à l&apos;Agent Marketing.
      </div>
    );
  }

  return <CouponsContent />;
}

function CouponsContent() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT',
    value: '',
    minOrderXof: '',
    maxUses: '',
  });

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: async () => (await api.get<Coupon[]>('/admin/coupons')).data,
  });

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/admin/coupons', {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      minOrderXof: form.minOrderXof ? Number(form.minOrderXof) : undefined,
      maxUses: form.maxUses ? Number(form.maxUses) : undefined,
    });
    setForm({ code: '', type: 'PERCENTAGE', value: '', minOrderXof: '', maxUses: '' });
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  }

  async function toggle(id: string, isActive: boolean) {
    await api.patch(`/admin/coupons/${id}/toggle`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Codes promo</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Nouveau code
        </button>
      </div>

      {showForm && (
        <form onSubmit={createCoupon} className="bg-white p-5 rounded-xl border border-gray-100 space-y-3 mb-6">
          <div className="grid md:grid-cols-4 gap-3">
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="CODE (ex: BIENVENUE)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="PERCENTAGE">Pourcentage (%)</option>
              <option value="FIXED_AMOUNT">Montant fixe (FCFA)</option>
            </select>
            <input
              required
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="Valeur"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              placeholder="Utilisations max (optionnel)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Créer
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Remise</th>
                <th className="px-4 py-3">Utilisations</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {coupons?.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono font-medium">{c.code}</td>
                  <td className="px-4 py-3">
                    {c.type === 'PERCENTAGE' ? `${c.value}%` : formatXof(c.value)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.usedCount} {c.maxUses ? `/ ${c.maxUses}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(c.id, c.isActive)}
                      className={`text-xs px-2 py-1 rounded-full ${
                        c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.isActive ? 'Actif' : 'Désactivé'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
