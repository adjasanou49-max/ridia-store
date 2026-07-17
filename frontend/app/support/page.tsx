'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { SupportChatWidget } from '@/components/SupportChatWidget';

type Tab = 'service' | 'produit' | 'notifications';

type Notification = {
  id: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  readAt: string | null;
  createdAt: string;
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'service', label: 'Service Client' },
  { key: 'produit', label: 'Support Produit' },
  { key: 'notifications', label: 'Notifications' },
];

const PRODUCT_FAQ = [
  {
    question: 'Combien de temps prend la livraison ?',
    answer:
      "Le délai dépend du produit et de ta ville. Une fois expédiée, ta commande affiche un suivi en 4 étapes mis à jour en temps réel.",
  },
  {
    question: 'Puis-je retourner un article ?',
    answer:
      "Oui, si l'article ne correspond pas à la description ou arrive endommagé. Ouvre un litige depuis la commande concernée, avec des photos si possible.",
  },
  {
    question: 'Quels moyens de paiement acceptez-vous ?',
    answer: 'Wave, Orange Money, MTN Mobile Money, et ton portefeuille Ridia Store.',
  },
  {
    question: 'Comment fonctionne le portefeuille (wallet) ?',
    answer:
      "Recharge du crédit via Mobile Money et paie instantanément au checkout. Les remboursements y sont crédités automatiquement en cas d'échec du remboursement direct.",
  },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Notification[]>('/notifications')
      .then(({ data }) => {
        if (!cancelled) setNotifications(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">Chargement…</p>;
  }

  if (error || notifications.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm text-gray-400">
          {error
            ? "Impossible de charger tes notifications pour l'instant."
            : "Tu n'as pas encore de notification."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {notifications.map((n) => (
        <div key={n.id} className="rounded-xl bg-white p-4 shadow-sm shadow-black/5">
          <div className="flex gap-3">
            <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-brand-500/10" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-gray-900">{n.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{n.body}</p>
              <p className="mt-2 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductSupportPanel() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="px-4 py-4">
      <div className="rounded-xl bg-white px-4">
        {PRODUCT_FAQ.map((item, i) => (
          <div key={item.question} className="border-b border-gray-100 py-4 last:border-b-0">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span className="text-[14px] font-medium text-gray-900">{item.question}</span>
              <span
                className={`shrink-0 text-lg text-brand-500 transition-transform ${
                  openIndex === i ? 'rotate-45' : ''
                }`}
              >
                +
              </span>
            </button>
            {openIndex === i && (
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{item.answer}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 px-1 text-center text-[12px] text-gray-400">
        Pas trouvé ta réponse ? Passe sur l&apos;onglet « Service Client ».
      </p>
    </div>
  );
}

export default function DiscussionPage() {
  const [tab, setTab] = useState<Tab>('service');

  return (
    <main className="flex flex-col bg-gray-50 h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 pt-4">
        <h1 className="text-lg font-semibold text-gray-900">Discussion</h1>
        <div className="mt-3 flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative pb-3 text-[14px] ${
                tab === t.key ? 'font-semibold text-gray-900' : 'text-gray-400'
              }`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-gray-900" />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {tab === 'service' && <SupportChatWidget />}
        {tab === 'produit' && (
          <div className="h-full overflow-y-auto">
            <ProductSupportPanel />
          </div>
        )}
        {tab === 'notifications' && (
          <div className="h-full overflow-y-auto">
            <NotificationsPanel />
          </div>
        )}
      </div>
    </main>
  );
}
