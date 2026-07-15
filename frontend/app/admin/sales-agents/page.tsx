'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

interface AgentPerformance {
  month: string;
  salesXof: number;
  orderCount: number;
  monthlyThresholdXof: number;
  thresholdMet: boolean;
  commissionPercent: number;
  commissionOwedXof: number;
}

interface SalesAgent {
  id: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED';
  commissionPercent: number;
  monthlyThresholdXof: number;
  agentName: string;
  agentEmail: string;
  currentMonth: AgentPerformance;
}

export default function AdminSalesAgentsPage() {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        ⛔ Cette page est réservée au propriétaire — conditions contractuelles sensibles.
      </div>
    );
  }

  return <SalesAgentsContent />;
}

function SalesAgentsContent() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['admin', 'sales-agents'],
    queryFn: async () => (await api.get<SalesAgent[]>('/admin/sales-agents')).data,
  });

  async function toggleStatus(agent: SalesAgent) {
    await api.patch(`/admin/sales-agents/${agent.id}`, {
      status: agent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
    });
    queryClient.invalidateQueries({ queryKey: ['admin', 'sales-agents'] });
  }

  async function saveTerms(id: string, commissionPercent: number, monthlyThresholdXof: number) {
    await api.patch(`/admin/sales-agents/${id}`, { commissionPercent, monthlyThresholdXof });
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ['admin', 'sales-agents'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Agents commerciaux</h1>
      <p className="text-sm text-gray-500 mb-6">
        Contrats de commission négociés individuellement (ex: 5% dès 1000$/mois de ventes
        apportées). Invite-les via{' '}
        <a href="/admin/invite-codes" className="text-brand-600 hover:underline">
          Codes d&apos;accès admin
        </a>
        .
      </p>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : agents && agents.length > 0 ? (
        <div className="space-y-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isEditing={editingId === agent.id}
              onEdit={() => setEditingId(agent.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={saveTerms}
              onToggleStatus={() => toggleStatus(agent)}
            />
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">
          Aucun agent commercial pour l&apos;instant. Génère un code depuis &quot;Codes
          d&apos;accès admin&quot; avec le rôle Agent Commercial.
        </p>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onToggleStatus,
}: {
  agent: SalesAgent;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (id: string, commissionPercent: number, monthlyThresholdXof: number) => void;
  onToggleStatus: () => void;
}) {
  const [commissionPercent, setCommissionPercent] = useState(String(agent.commissionPercent));
  const [monthlyThresholdXof, setMonthlyThresholdXof] = useState(String(agent.monthlyThresholdXof));
  const perf = agent.currentMonth;

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold">{agent.agentName}</p>
          <p className="text-xs text-gray-400">
            {agent.agentEmail} · code <span className="font-mono">{agent.code}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              agent.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {agent.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
          </span>
          <button onClick={onToggleStatus} className="text-xs text-gray-500 hover:underline">
            {agent.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
        <div>
          <p className="text-xs text-gray-400">Ventes ce mois</p>
          <p className="font-semibold">{formatXof(perf.salesXof)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Seuil mensuel</p>
          <p className="font-semibold">{formatXof(perf.monthlyThresholdXof)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Statut du seuil</p>
          <p className={`font-semibold ${perf.thresholdMet ? 'text-green-600' : 'text-gray-400'}`}>
            {perf.thresholdMet ? '✓ Atteint' : 'Pas encore'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Commission due</p>
          <p className="font-semibold text-brand-600">{formatXof(perf.commissionOwedXof)}</p>
        </div>
      </div>

      {isEditing ? (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
          <label className="text-xs text-gray-500">Commission %</label>
          <input
            type="number"
            step="0.5"
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
          <label className="text-xs text-gray-500">Seuil mensuel (FCFA)</label>
          <input
            type="number"
            step="1000"
            value={monthlyThresholdXof}
            onChange={(e) => setMonthlyThresholdXof(e.target.value)}
            className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
          <button
            onClick={() => onSave(agent.id, Number(commissionPercent), Number(monthlyThresholdXof))}
            className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            Enregistrer
          </button>
          <button onClick={onCancelEdit} className="text-xs text-gray-400">
            Annuler
          </button>
        </div>
      ) : (
        <button onClick={onEdit} className="text-xs text-brand-600 hover:underline pt-2 border-t border-gray-100 w-full text-left">
          Modifier commission ({agent.commissionPercent}%) / seuil ({formatXof(agent.monthlyThresholdXof)})
        </button>
      )}
    </div>
  );
}
