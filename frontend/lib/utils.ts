import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatXof(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

/**
 * Détermine le prix unitaire applicable pour une quantité donnée, selon les paliers
 * dégressifs du produit (style 1688/Taobao/Pinduoduo). Miroir exact de
 * ProductService.getUnitPriceForQuantity côté backend — à garder synchronisé.
 */
export function getUnitPriceForQuantity(
  product: { basePriceXof: number; priceTiers?: { minQuantity: number; pricePerUnitXof: number }[] },
  quantity: number
): number {
  const tiers = product.priceTiers ?? [];
  const applicable = tiers
    .filter((t) => quantity >= t.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];
  return applicable ? applicable.pricePerUnitXof : product.basePriceXof;
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}
