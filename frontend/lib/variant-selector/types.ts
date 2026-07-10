/**
 * ============================================================================
 * TYPES GÉNÉRIQUES - VariantSelector
 * ============================================================================
 * Aucun de ces types ne dépend d'une application, d'un schema de base de
 * données, ou d'un domaine métier précis. Toute app qui a des "variantes de
 * produit" (couleur, taille, format...) peut les utiliser tel quel.
 */

/** Une combinaison d'options qui identifie une variante (ex: Couleur=Rouge, Taille=M) */
export interface VariantOption {
  attributeName: string;
  value: string;
}

/**
 * Une variante telle que fournie par l'application hôte. `costPrice` est
 * exprimé dans une devise de référence choisie par l'app hôte (ex: coût
 * fournisseur en CNY, en USD, peu importe) - le composant ne fait AUCUNE
 * hypothèse dessus, il applique juste la formule de marge qu'on lui donne.
 */
export interface VariantData {
  id: string;
  sku?: string;
  options: VariantOption[];
  costPrice: number;
  stock: number;
  weightKg: number;
  imageUrl?: string;
}

/** Formule de marge - pourcentage ou montant fixe, dans la devise de référence */
export type MarginFormula =
  | { type: 'percentage'; value: number }
  | { type: 'fixed'; value: number };

/**
 * Config de devise cible. `rateFromReference` convertit 1 unité de la devise
 * de référence (celle de `costPrice`) vers la devise cible. Par exemple, si
 * costPrice est en USD et que la cible est le FCFA : rateFromReference = 615.
 */
export interface CurrencyConfig {
  code: string;
  symbol?: string;
  rateFromReference: number;
  locale?: string;
  decimals?: number;
}

/** Résultat renvoyé à l'app hôte dès qu'une variante complète est sélectionnée */
export interface VariantSelectionResult {
  variant: VariantData;
  /** Prix final = costPrice + marge, converti dans la devise cible */
  price: number;
  currencyCode: string;
  /** Poids exact en kg - à transmettre tel quel à n'importe quel service logistique */
  weightKg: number;
  sku?: string;
}

export interface VariantSelectorProps {
  /** Toutes les variantes possibles du produit */
  variants: VariantData[];
  /** Formule de marge de l'app active. Défaut: 50% si non fournie. */
  marginFormula?: MarginFormula;
  /** Devise cible d'affichage/calcul */
  currency: CurrencyConfig;
  /** Appelé à chaque changement, avec `null` tant que la sélection est incomplète */
  onVariantChange?: (result: VariantSelectionResult | null) => void;
  /** Appelé à chaque changement de validité (pratique pour activer/désactiver "Ajouter au panier") */
  onValidityChange?: (isValid: boolean) => void;
  /** Libellé du groupe si un produit n'a qu'un seul attribut sans nom (rare) */
  fallbackAttributeLabel?: string;
  /** Classes CSS optionnelles pour s'intégrer au design system de l'app hôte */
  classNames?: {
    container?: string;
    group?: string;
    groupLabel?: string;
    option?: string;
    optionSelected?: string;
    optionDisabled?: string;
  };
}
