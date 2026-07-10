'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { formatXof } from '@/lib/utils';

function computeRemaining(target: string): number {
  return Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function PriceIncreaseCountdown({
  scheduledAt,
  newPriceXof,
  compact = false,
}: {
  scheduledAt: string;
  newPriceXof: number;
  compact?: boolean;
}) {
  const [remaining, setRemaining] = useState(() => computeRemaining(scheduledAt));

  useEffect(() => {
    const interval = setInterval(() => setRemaining(computeRemaining(scheduledAt)), 1000);
    return () => clearInterval(interval);
  }, [scheduledAt]);

  if (remaining <= 0) return null; // le prix a déjà augmenté côté serveur, pas la peine d'afficher

  if (compact) {
    return (
      <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
        <TrendingUp size={11} /> Prix augmente dans {formatDuration(remaining)}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-orange-50 text-orange-700 text-sm px-3 py-2 rounded-lg">
      <TrendingUp size={15} />
      <span>
        Ce prix passera à <strong>{formatXof(newPriceXof)}</strong> dans{' '}
        <strong className="font-mono">{formatDuration(remaining)}</strong>
      </span>
    </div>
  );
}
