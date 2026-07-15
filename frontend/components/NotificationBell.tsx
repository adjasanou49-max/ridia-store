'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api, getAccessToken, API_URL } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NotificationItem {
  id: string;
  channel: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const pathname = usePathname();

  // Le clic sur le fond (ci-dessous) ne suffit pas : un tap sur la bottom nav
  // passe par-dessus (elle a son propre z-index) et ne déclenche jamais ce
  // clic, donc le panneau restait ouvert par-dessus la page suivante.
  // Ajustement pendant le rendu plutôt que setState dans un effet (évite un
  // rendu en cascade inutile) - pattern recommandé par React pour "réinitialiser
  // un état quand une prop/valeur externe change".
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data,
    enabled: !!user,
    // Le flux temps réel (ci-dessous) invalide déjà cette requête à chaque nouvelle
    // notification - ce polling ne sert que de filet de sécurité si le flux tombe.
    refetchInterval: 60_000,
  });

  // Flux temps réel : dès qu'une notification est créée côté serveur, elle arrive
  // ici immédiatement (Redis pub/sub -> SSE), sans attendre le prochain polling.
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;

    const eventSource = new EventSource(`${API_URL}/notifications/stream?token=${token}`);

    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    eventSource.onerror = () => {
      // EventSource se reconnecte tout seul nativement - rien à faire ici,
      // le polling de secours ci-dessus prend le relais en attendant.
    };

    return () => eventSource.close();
  }, [user, queryClient]);

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => (await api.get<NotificationItem[]>('/notifications')).data,
    enabled: !!user && open,
  });

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  if (!user) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative">
        <Bell className="text-gray-700" size={21} />
        {unread && unread.count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread.count > 9 ? '9+' : unread.count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-gray-100 shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-sm">Notifications</p>
              {unread && unread.count > 0 && (
                <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            {notifications && notifications.length > 0 ? (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                    !n.readAt ? 'bg-brand-50/40' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </button>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucune notification</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
