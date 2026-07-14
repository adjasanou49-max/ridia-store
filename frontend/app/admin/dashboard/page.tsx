'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Users, Store, Package, ShoppingBag, Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface DailyTrendPoint {
  date: string;
  revenueXof: number;
  orderCount: number;
}

interface TopProduct {
  productId: string;
  name: string;
  revenueXof: number;
  unitsSold: number;
}

interface LatestOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalXof: number;
  createdAt: string;
  customerName: string;
}

interface DashboardStats {
  userCount: number;
  sellerCount: number;
  productCount: number;
  totalGMV: number;
  totalOrders: number;
  dailyTrend: DailyTrendPoint[];
  topProducts: TopProduct[];
  revenueTrendPercent: number | null;
  orderTrendPercent: number | null;
  latestOrders: LatestOrder[];
  alerts: { pendingSellers: number; pendingProducts: number; openDisputes: number };
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'bg-amber-50 text-amber-700' },
  CONFIRMED: { label: 'Confirmée', className: 'bg-blue-50 text-blue-700' },
  PROCESSING: { label: 'En préparation', className: 'bg-blue-50 text-blue-700' },
  SHIPPED: { label: 'Expédiée', className: 'bg-indigo-50 text-indigo-700' },
  DELIVERED: { label: 'Livrée', className: 'bg-green-50 text-green-700' },
  CANCELLED: { label: 'Annulée', className: 'bg-gray-100 text-gray-500' },
  REFUNDED: { label: 'Remboursée', className: 'bg-gray-100 text-gray-500' },
  DISPUTED: { label: 'Litige', className: 'bg-red-50 text-red-700' },
};

// Format compact pour l'axe Y du graphique (ex: "1,2M" plutôt que "1200000")
function compactXof(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(Math.round(amount));
}
function shortDate(isoDate: string) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}
function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function TrendBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const positive = percent >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        positive ? 'text-green-600' : 'text-red-600'
      }`}
    >
      <Icon size={13} />
      {positive ? '+' : ''}
      {percent}% vs 30j précédents
    </span>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/admin/dashboard')).data,
    refetchInterval: 60_000,
  });

  const cards = [
    { label: 'GMV total', value: data ? formatXof(data.totalGMV) : '—', icon: Wallet, trend: data?.revenueTrendPercent },
    { label: 'Commandes totales', value: data?.totalOrders ?? '—', icon: ShoppingBag, trend: data?.orderTrendPercent },
    { label: 'Produits actifs', value: data?.productCount ?? '—', icon: Package },
    { label: 'Vendeurs approuvés', value: data?.sellerCount ?? '—', icon: Store },
    { label: 'Utilisateurs', value: data?.userCount ?? '—', icon: Users },
  ];

  const chartData = data?.dailyTrend.map((p) => ({ ...p, label: shortDate(p.date) })) ?? [];

  const alertItems = data
    ? [
        {
          key: 'sellers',
          count: data.alerts.pendingSellers,
          label: 'vendeur(s) en attente d\'approbation',
          href: '/admin/sellers',
        },
        {
          key: 'products',
          count: data.alerts.pendingProducts,
          label: 'produit(s) en attente de review',
          href: '/admin/products',
        },
        {
          key: 'disputes',
          count: data.alerts.openDisputes,
          label: 'litige(s) ouvert(s)',
          href: '/admin/disputes',
        },
      ].filter((a) => a.count > 0)
    : [];

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-gray-500">
            {user ? `Bonjour ${user.firstName}` : ''} — vue d&apos;ensemble de Ridia Store
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Mis à jour {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Alertes prioritaires */}
      {alertItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle size={16} />À traiter en priorité
          </div>
          <div className="flex flex-wrap gap-2">
            {alertItems.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100"
              >
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                  {a.count}
                </span>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white p-5 rounded-xl border border-gray-100">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-gray-500">{c.label}</p>
                    <Icon size={16} className="text-gray-300" />
                  </div>
                  <p className="text-2xl font-bold">{c.value}</p>
                  {c.trend !== undefined && <TrendBadge percent={c.trend ?? null} />}
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mt-6">
            <div className="bg-white p-5 rounded-xl border border-gray-100">
              <h2 className="font-semibold mb-4">Chiffre d&apos;affaires - 30 derniers jours</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={compactXof} />
                    <Tooltip
                      formatter={(value: number) => formatXof(value)}
                      labelFormatter={(label) => `Le ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenueXof"
                      name="CA"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400">Pas encore assez de données.</p>
              )}
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-100">
              <h2 className="font-semibold mb-4">Commandes - 30 derniers jours</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(label) => `Le ${label}`} />
                    <Bar dataKey="orderCount" name="Commandes" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400">Pas encore assez de données.</p>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mt-6">
            {/* Commandes récentes */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Commandes récentes</h2>
                <Link href="/admin/orders" className="text-xs text-brand-600 font-medium hover:underline">
                  Voir tout →
                </Link>
              </div>
              {data && data.latestOrders.length > 0 ? (
                <div className="space-y-1">
                  {data.latestOrders.map((o) => {
                    const status = STATUS_LABELS[o.status] ?? { label: o.status, className: 'bg-gray-100 text-gray-600' };
                    return (
                      <Link
                        key={o.id}
                        href={`/admin/orders?orderNumber=${o.orderNumber}`}
                        className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{o.customerName}</p>
                          <p className="text-xs text-gray-400">
                            {o.orderNumber} · {relativeTime(o.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                          <span className="font-semibold w-24 text-right">{formatXof(o.totalXof)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucune commande pour l&apos;instant.</p>
              )}
            </div>

            {/* Top produits */}
            <div className="bg-white p-5 rounded-xl border border-gray-100">
              <h2 className="font-semibold mb-4">Top 5 produits</h2>
              {data && data.topProducts.length > 0 ? (
                <div className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <div key={p.productId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400 font-mono w-4">{i + 1}</span>
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="font-semibold">{formatXof(p.revenueXof)}</div>
                        <div className="text-xs text-gray-400">{p.unitsSold} vendus</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucune vente enregistrée pour l&apos;instant.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
