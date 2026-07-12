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

jest.mock('../config/prisma', () => ({
  prisma: {
    systemSetting: { findUnique: jest.fn() },
    category: { findUnique: jest.fn() },
    product: { create: jest.fn() },
  },
}));
jest.mock('../integrations/ai/ContentModerationAgent', () => ({
  contentModerationAgent: { sanitizeDescription: jest.fn((t: string) => Promise.resolve(t)) },
}));

import { prisma } from '../config/prisma';

const mockedPrisma = prisma as unknown as {
  systemSetting: { findUnique: jest.Mock };
  category: { findUnique: jest.Mock };
  product: { create: jest.Mock };
};

describe('ProductService.createProduct - correction bug critique (prix CNY à 0 = produit gratuit silencieux)', () => {
  const service = new ProductService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.systemSetting.findUnique.mockResolvedValue(null); // pas de taux configuré -> valeur par défaut env
    mockedPrisma.category.findUnique.mockResolvedValue({ defaultMarginPercent: 80 });
  });

  it('rejette un costPriceCny de 0 au lieu de créer un produit gratuit silencieusement', async () => {
    await expect(
      service.createProduct({
        sellerId: 's1',
        categoryId: 'c1',
        name: 'Produit test',
        description: 'desc',
        costPriceCny: 0,
        stockQuantity: 10,
        images: [],
      } as any)
    ).rejects.toThrow('Coût CNY invalide (0)');

    expect(mockedPrisma.product.create).not.toHaveBeenCalled();
  });

  it('rejette un costPriceCny négatif', async () => {
    await expect(
      service.createProduct({
        sellerId: 's1',
        categoryId: 'c1',
        name: 'Produit test',
        description: 'desc',
        costPriceCny: -5,
        stockQuantity: 10,
        images: [],
      } as any)
    ).rejects.toThrow('Coût CNY invalide');
  });

  it("rejette si ni prix ni coût CNY n'est fourni du tout", async () => {
    await expect(
      service.createProduct({
        sellerId: 's1',
        categoryId: 'c1',
        name: 'Produit test',
        description: 'desc',
        stockQuantity: 10,
        images: [],
      } as any)
    ).rejects.toThrow('Aucun prix ni coût CNY fourni');
  });

  it('accepte un costPriceCny strictement positif', async () => {
    mockedPrisma.product.create.mockResolvedValue({ id: 'p1', basePriceXof: 1600 });

    await service.createProduct({
      sellerId: 's1',
      categoryId: 'c1',
      name: 'Produit test',
      description: 'desc',
      costPriceCny: 10,
      stockQuantity: 10,
      images: [],
    } as any);

    expect(mockedPrisma.product.create).toHaveBeenCalled();
  });
});
