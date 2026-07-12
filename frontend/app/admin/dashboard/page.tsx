'use client';

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
import { api } from '@/lib/api';
import { formatXof } from '@/lib/utils';

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

interface DashboardStats {
  userCount: number;
  sellerCount: number;
  productCount: number;
  totalGMV: number;
  totalOrders: number;
  dailyTrend: DailyTrendPoint[];
  topProducts: TopProduct[];
}

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

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/admin/dashboard')).data,
  });

  const cards = [
    { label: 'Utilisateurs', value: data?.userCount ?? '—' },
    { label: 'Vendeurs approuvés', value: data?.sellerCount ?? '—' },
    { label: 'Produits actifs', value: data?.productCount ?? '—' },
    { label: 'Commandes totales', value: data?.totalOrders ?? '—' },
    { label: 'GMV total', value: data ? formatXof(data.totalGMV) : '—' },
  ];

  const chartData = data?.dailyTrend.map((p) => ({ ...p, label: shortDate(p.date) })) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tableau de bord Admin</h1>

      {isLoading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-white p-5 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500 mb-1">{c.label}</p>
                <p className="text-2xl font-bold">{c.value}</p>
              </div>
            ))}
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

          <div className="grid lg:grid-cols-2 gap-4 mt-6">
            <div className="bg-white p-5 rounded-xl border border-gray-100">
              <h2 className="font-semibold mb-4">Top 5 produits (par chiffre d&apos;affaires)</h2>
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

            <div className="bg-white p-5 rounded-xl border border-gray-100">
              <h2 className="font-semibold mb-3">Actions rapides</h2>
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  href="/admin/sellers"
                  className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg font-medium hover:bg-brand-100"
                >
                  Vendeurs en attente d&apos;approbation
                </a>
                <a
                  href="/admin/products"
                  className="px-4 py-2 bg-brand-50 text-brand-700 rounded-lg font-medium hover:bg-brand-100"
                >
                  Produits en attente de review
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
