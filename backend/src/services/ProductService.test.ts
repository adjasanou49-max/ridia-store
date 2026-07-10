import { ProductService } from './ProductService';

describe('ProductService - calculatePriceXof', () => {
  const service = new ProductService();

  it('calcule correctement le prix avec marge 80% et taux 90', () => {
    // 10 CNY * 90 = 900 XOF cost, +80% margin = 1620, rounded to nearest 50
    const price = service.calculatePriceXof(10, 80, 90);
    expect(price).toBe(1600); // 1620 rounds to nearest 50 -> 1600
  });

  it('gère un prix bas correctement', () => {
    const price = service.calculatePriceXof(1, 80, 90);
    // 1 * 90 = 90, *1.8 = 162, rounds to 150
    expect(price).toBe(150);
  });

  it('gère une marge de 0%', () => {
    const price = service.calculatePriceXof(5, 0, 90);
    // 5 * 90 = 450, no margin
    expect(price).toBe(450);
  });

  it('utilise le taux par défaut si non fourni', () => {
    const price = service.calculatePriceXof(10, 80);
    expect(price).toBeGreaterThan(0);
  });
});
