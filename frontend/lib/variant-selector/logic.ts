import type { VariantData, MarginFormula, CurrencyConfig, VariantSelectionResult } from './types';

/**
 * Extrait la liste des groupes d'attributs (ex: "Couleur", "Taille") et leurs
 * valeurs uniques possibles, à partir de la liste brute des variantes.
 * L'ordre des groupes suit leur ordre de première apparition.
 */
export function extractAttributeGroups(variants: VariantData[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const variant of variants) {
    for (const option of variant.options) {
      if (!groups.has(option.attributeName)) {
        groups.set(option.attributeName, []);
      }
      const values = groups.get(option.attributeName)!;
      if (!values.includes(option.value)) {
        values.push(option.value);
      }
    }
  }

  return groups;
}

/** Une variante correspond-elle exactement à la sélection courante ? */
function matchesSelection(variant: VariantData, selection: Record<string, string>): boolean {
  return variant.options.every((opt) => selection[opt.attributeName] === opt.value);
}

/**
 * Une valeur d'attribut est-elle disponible (au moins une variante en stock)
 * compte tenu du reste de la sélection courante ? Utilisé pour griser les
 * options qui mèneraient forcément à une variante en rupture.
 */
export function isOptionAvailable(
  variants: VariantData[],
  attributeName: string,
  value: string,
  currentSelection: Record<string, string>
): boolean {
  const hypothetical = { ...currentSelection, [attributeName]: value };

  return variants.some((variant) => {
    const relevant = variant.options.every((opt) => {
      const chosen = hypothetical[opt.attributeName];
      return chosen === undefined || chosen === opt.value;
    });
    return relevant && variant.stock > 0;
  });
}

/** Trouve la variante exacte qui correspond à une sélection complète, sinon null */
export function findMatchingVariant(
  variants: VariantData[],
  selection: Record<string, string>,
  totalAttributeCount: number
): VariantData | null {
  if (Object.keys(selection).length !== totalAttributeCount) return null;
  return variants.find((v) => matchesSelection(v, selection)) ?? null;
}

/** Applique la formule de marge au coût de référence */
export function applyMargin(costPrice: number, formula: MarginFormula): number {
  if (formula.type === 'percentage') {
    return costPrice * (1 + formula.value / 100);
  }
  return costPrice + formula.value;
}

/** Convertit un prix (devise de référence) vers la devise cible et arrondit proprement */
export function convertCurrency(amount: number, currency: CurrencyConfig): number {
  const converted = amount * currency.rateFromReference;
  const decimals = currency.decimals ?? 0;
  const factor = Math.pow(10, decimals);
  return Math.round(converted * factor) / factor;
}

/** Formate un prix pour affichage (Intl.NumberFormat, respecte la locale fournie) */
export function formatPrice(amount: number, currency: CurrencyConfig): string {
  const formatted = new Intl.NumberFormat(currency.locale ?? 'fr-FR', {
    minimumFractionDigits: currency.decimals ?? 0,
    maximumFractionDigits: currency.decimals ?? 0,
  }).format(amount);
  return currency.symbol ? `${formatted} ${currency.symbol}` : `${formatted} ${currency.code}`;
}

/** Construit le résultat complet renvoyé par onVariantChange, à partir d'une variante trouvée */
export function buildSelectionResult(
  variant: VariantData,
  marginFormula: MarginFormula,
  currency: CurrencyConfig
): VariantSelectionResult {
  const priceWithMargin = applyMargin(variant.costPrice, marginFormula);
  const price = convertCurrency(priceWithMargin, currency);

  return {
    variant,
    price,
    currencyCode: currency.code,
    weightKg: variant.weightKg,
    sku: variant.sku,
  };
}

export const DEFAULT_MARGIN: MarginFormula = { type: 'percentage', value: 50 };
