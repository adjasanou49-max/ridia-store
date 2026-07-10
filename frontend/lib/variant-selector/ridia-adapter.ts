import type { VariantData } from './types';
import type { ProductVariant } from '@/types';

/**
 * Convertit les variantes Ridia Store (format Prisma/API) vers le format
 * générique attendu par le VariantSelector réutilisable.
 *
 * Ridia stocke `attributes` en JSON libre (ex: { Couleur: "Rouge", Taille: "M" }).
 * Si une variante n'a pas d'attributs structurés (créée avant l'écran de gestion
 * des attributs, ou via l'ancien formulaire "nom libre"), on retombe sur un seul
 * groupe générique "Option" avec le nom de la variante comme valeur - le
 * composant reste fonctionnel même sur les données existantes.
 *
 * `priceXof` chez Ridia EST déjà le prix de vente final (pas un coût brut) -
 * donc on passe une marge nulle et un taux de conversion de 1 : le composant
 * se contente d'afficher priceXof tel quel, sans recalcul.
 */
export function mapRidiaVariantsToGeneric(
  variants: ProductVariant[],
  fallbackWeightKg: number = 0
): VariantData[] {
  return variants.map((v) => {
    const attributeEntries = v.attributes ? Object.entries(v.attributes) : [];

    return {
      id: v.id,
      options:
        attributeEntries.length > 0
          ? attributeEntries.map(([attributeName, value]) => ({
              attributeName,
              value: String(value),
            }))
          : [{ attributeName: 'Option', value: v.name }],
      costPrice: v.priceXof,
      stock: v.stockQuantity,
      // Poids propre à la variante si tracé, sinon on hérite du produit parent
      weightKg: v.weightKg ?? fallbackWeightKg,
      imageUrl: v.imageUrl ?? undefined,
    };
  });
}

export const RIDIA_PASSTHROUGH_MARGIN = { type: 'fixed' as const, value: 0 };
export const RIDIA_PASSTHROUGH_CURRENCY = {
  code: 'XOF',
  symbol: 'FCFA',
  rateFromReference: 1,
  locale: 'fr-FR',
  decimals: 0,
};
