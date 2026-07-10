'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './auth';

interface WishlistContextValue {
  productIds: Set<string>;
  isWishlisted: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [productIds, setProductIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setProductIds(new Set());
      return;
    }
    try {
      const { data } = await api.get<string[]>('/wishlist/ids');
      setProductIds(new Set(data));
    } catch {
      // silently ignore
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  async function toggle(productId: string) {
    // Mise à jour optimiste - réactivité immédiate du coeur
    setProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

    try {
      await api.post(`/wishlist/${productId}/toggle`);
    } catch {
      await refresh(); // rollback en resynchronisant avec le serveur
    }
  }

  return (
    <WishlistContext.Provider
      value={{ productIds, isWishlisted: (id) => productIds.has(id), toggle }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist doit être utilisé dans un WishlistProvider');
  return ctx;
}
