'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { api } from './api';

const CURRENCY_LABELS: Record<string, { label: string; symbol: string }> = {
  XOF: { label: 'Franc CFA', symbol: 'FCFA' },
  USD: { label: 'Dollar US', symbol: '$' },
  EUR: { label: 'Euro', symbol: '€' },
  NGN: { label: 'Naira (Nigeria)', symbol: '₦' },
  GHS: { label: 'Cedi (Ghana)', symbol: 'GH₵' },
  GBP: { label: 'Livre Sterling', symbol: '£' },
  CAD: { label: 'Dollar Canadien', symbol: 'CA$' },
};

interface CurrencyContextValue {
  currency: string;
  setCurrency: (code: string) => void;
  availableCurrencies: string[];
  /** Convertit un montant XOF vers la devise choisie et le formate pour affichage */
  formatPrice: (amountXof: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(() => Cookies.get('ridia_currency') || 'XOF');

  const { data } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () =>
      (await api.get<{ baseCurrency: string; rates: Record<string, number> }>('/products/meta/currencies')).data,
    staleTime: 60 * 60 * 1000, // 1h - les taux ne changent pas souvent
  });

  function setCurrency(code: string) {
    setCurrencyState(code);
    Cookies.set('ridia_currency', code, { expires: 365 });
  }

  function formatPrice(amountXof: number): string {
    if (currency === 'XOF' || !data?.rates[currency]) {
      return new Intl.NumberFormat('fr-FR').format(Math.round(amountXof)) + ' FCFA';
    }

    const converted = amountXof * data.rates[currency];
    const symbol = CURRENCY_LABELS[currency]?.symbol ?? currency;
    return `≈ ${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted)} ${symbol}`;
  }

  const availableCurrencies = ['XOF', ...Object.keys(data?.rates ?? { USD: 0, EUR: 0 })];

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, availableCurrencies, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency doit être utilisé dans un CurrencyProvider');
  return ctx;
}

export function currencyLabel(code: string): string {
  return CURRENCY_LABELS[code]?.label ?? code;
}
