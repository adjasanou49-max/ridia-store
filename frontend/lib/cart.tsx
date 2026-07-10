'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import type { CartItem } from '@/types';

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  addToCart: (productId: string, quantity: number, variantId?: string) => Promise<void>;
  removeItem: (cartItemId: string) => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await api.get<CartItem[]>('/orders/cart');
      setItems(data);
    } catch {
      // silently ignore - user may not be logged in yet
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  async function addToCart(productId: string, quantity: number, variantId?: string) {
    await api.post('/orders/cart', { productId, quantity, variantId });
    await refresh();
  }

  async function removeItem(cartItemId: string) {
    await api.delete(`/orders/cart/${cartItemId}`);
    await refresh();
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, itemCount, isLoading, refresh, addToCart, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans un CartProvider');
  return ctx;
}
