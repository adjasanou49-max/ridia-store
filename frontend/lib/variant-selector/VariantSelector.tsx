'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VariantSelectorProps } from './types';
import {
  extractAttributeGroups,
  isOptionAvailable,
  findMatchingVariant,
  buildSelectionResult,
  formatPrice,
  DEFAULT_MARGIN,
} from './logic';

/**
 * ============================================================================
 * VariantSelector - composant 100% générique et réutilisable
 * ============================================================================
 * - Ne connaît rien du domaine métier de l'app hôte (pas de "produit Ridia",
 *   pas de schema Prisma, rien). Il reçoit des VariantData[] génériques.
 * - Ne dépend d'aucun framework CSS (pas de Tailwind requis) : les styles
 *   sont en inline avec des valeurs par défaut sobres, et `classNames`
 *   permet à l'app hôte de les remplacer par ses propres classes.
 * - Toute la logique de calcul (marge, devise, disponibilité) est dans
 *   logic.ts, testable indépendamment de React.
 */
export function VariantSelector({
  variants,
  marginFormula = DEFAULT_MARGIN,
  currency,
  onVariantChange,
  onValidityChange,
  fallbackAttributeLabel = 'Option',
  classNames,
}: VariantSelectorProps) {
  const attributeGroups = useMemo(() => extractAttributeGroups(variants), [variants]);
  const totalAttributeCount = attributeGroups.size;

  const [selection, setSelection] = useState<Record<string, string>>({});

  const matchedVariant = useMemo(
    () => findMatchingVariant(variants, selection, totalAttributeCount),
    [variants, selection, totalAttributeCount]
  );

  const isComplete = matchedVariant !== null && matchedVariant.stock > 0;

  useEffect(() => {
    if (!onVariantChange) return;
    if (matchedVariant && matchedVariant.stock > 0) {
      onVariantChange(buildSelectionResult(matchedVariant, marginFormula, currency));
    } else {
      onVariantChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedVariant, marginFormula, currency]);

  useEffect(() => {
    onValidityChange?.(isComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  function selectOption(attributeName: string, value: string) {
    setSelection((prev) => ({ ...prev, [attributeName]: value }));
  }

  if (variants.length === 0) return null;

  return (
    <div className={classNames?.container} style={!classNames?.container ? styles.container : undefined}>
      {Array.from(attributeGroups.entries()).map(([attributeName, values]) => (
        <div
          key={attributeName}
          className={classNames?.group}
          style={!classNames?.group ? styles.group : undefined}
        >
          <label
            className={classNames?.groupLabel}
            style={!classNames?.groupLabel ? styles.groupLabel : undefined}
          >
            {attributeName || fallbackAttributeLabel}
          </label>
          <div style={styles.optionsRow}>
            {values.map((value) => {
              const available = isOptionAvailable(variants, attributeName, value, selection);
              const selected = selection[attributeName] === value;

              const optionClass = selected
                ? classNames?.optionSelected
                : !available
                ? classNames?.optionDisabled
                : classNames?.option;

              const optionStyle = !classNames?.option
                ? {
                    ...styles.option,
                    ...(selected ? styles.optionSelected : {}),
                    ...(!available ? styles.optionDisabled : {}),
                  }
                : undefined;

              return (
                <button
                  key={value}
                  type="button"
                  disabled={!available}
                  onClick={() => selectOption(attributeName, value)}
                  className={optionClass}
                  style={optionStyle}
                  aria-pressed={selected}
                  aria-disabled={!available}
                >
                  {value}
                  {!available && ' ✕'}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {matchedVariant && (
        <div style={styles.summary}>
          <strong>{formatPrice(buildSelectionResult(matchedVariant, marginFormula, currency).price, currency)}</strong>
          <span style={styles.summaryMeta}>
            {matchedVariant.stock > 0 ? `${matchedVariant.weightKg} kg` : 'Rupture de stock'}
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  group: { display: 'flex', flexDirection: 'column', gap: 8 },
  groupLabel: { fontSize: 14, fontWeight: 600, color: '#374151' },
  optionsRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  option: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #D1D5DB',
    background: '#FFFFFF',
    color: '#374151',
    fontSize: 14,
    cursor: 'pointer',
  },
  optionSelected: {
    borderColor: '#F97316',
    background: '#FFF7ED',
    color: '#C2410C',
    fontWeight: 600,
  },
  optionDisabled: {
    opacity: 0.4,
    textDecoration: 'line-through',
    cursor: 'not-allowed',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 15,
  },
  summaryMeta: { color: '#9CA3AF', fontSize: 13 },
};
