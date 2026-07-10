import { formatXof, getUnitPriceForQuantity, formatDate } from './utils';

describe('formatXof', () => {
  it('formate un montant avec le séparateur de milliers français et le suffixe FCFA', () => {
    // Intl.NumberFormat('fr-FR') utilise une espace insécable étroite (U+202F)
    // comme séparateur de milliers, invisible à l'œil mais différente d'une
    // espace normale - on vérifie donc avec une regex tolérante aux espaces.
    expect(formatXof(15000)).toMatch(/^15\s000\sFCFA$/);
  });

  it('arrondit les décimales', () => {
    expect(formatXof(1499.6)).toMatch(/^1\s500\sFCFA$/);
  });

  it('gère zéro', () => {
    expect(formatXof(0)).toBe('0 FCFA');
  });
});

describe('getUnitPriceForQuantity', () => {
  const product = {
    basePriceXof: 5000,
    priceTiers: [
      { minQuantity: 10, pricePerUnitXof: 4000 },
      { minQuantity: 50, pricePerUnitXof: 3000 },
    ],
  };

  it('renvoie le prix de base sous le premier palier', () => {
    expect(getUnitPriceForQuantity(product, 1)).toBe(5000);
    expect(getUnitPriceForQuantity(product, 9)).toBe(5000);
  });

  it('applique le palier atteint exactement', () => {
    expect(getUnitPriceForQuantity(product, 10)).toBe(4000);
  });

  it('applique le palier le plus élevé applicable, pas le premier atteint', () => {
    expect(getUnitPriceForQuantity(product, 60)).toBe(3000);
  });

  it('fonctionne sans aucun palier défini', () => {
    expect(getUnitPriceForQuantity({ basePriceXof: 2000 }, 100)).toBe(2000);
  });
});

describe('formatDate', () => {
  it('formate une date ISO en français long', () => {
    const result = formatDate('2026-07-05T10:00:00.000Z');
    expect(result).toContain('2026');
    expect(result).toContain('juillet');
  });
});
