jest.mock('../services/SellerService', () => ({ sellerService: {} }));
jest.mock('../services/OrderService', () => ({ orderService: {} }));
jest.mock('../services/ProductService', () => ({ productService: {} }));
jest.mock('../config/prisma', () => ({ prisma: {} }));
jest.mock('../integrations/ai/ContentModerationAgent', () => ({ contentModerationAgent: {} }));
jest.mock('../services/DisputeService', () => ({ disputeService: {} }));
jest.mock('../services/CouponService', () => ({ couponService: {} }));
jest.mock('../services/AdminInviteService', () => ({ adminInviteService: {} }));

import { canDeactivateTarget, validateTierThresholdsOrder } from './admin.routes';

describe('canDeactivateTarget - correction faille de privilège (désactivation de compte admin)', () => {
  it('un ADMIN peut désactiver un CUSTOMER', () => {
    expect(canDeactivateTarget('ADMIN', 'CUSTOMER')).toBe(true);
  });

  it('un ADMIN peut désactiver un SELLER', () => {
    expect(canDeactivateTarget('ADMIN', 'SELLER')).toBe(true);
  });

  it("un ADMIN NE PEUT PAS désactiver un autre ADMIN (faille corrigée)", () => {
    expect(canDeactivateTarget('ADMIN', 'ADMIN')).toBe(false);
  });

  it('un ADMIN NE PEUT PAS désactiver un SUPER_ADMIN (faille corrigée - risque de verrouillage)', () => {
    expect(canDeactivateTarget('ADMIN', 'SUPER_ADMIN')).toBe(false);
  });

  it('un SUPER_ADMIN peut désactiver un autre ADMIN', () => {
    expect(canDeactivateTarget('SUPER_ADMIN', 'ADMIN')).toBe(true);
  });

  it('un SUPER_ADMIN peut désactiver un autre SUPER_ADMIN', () => {
    expect(canDeactivateTarget('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
  });
});

describe('validateTierThresholdsOrder - correction (paliers de fidélité mal ordonnés)', () => {
  const validThresholds = [
    { tier: 'platine', minPoints: 5000 },
    { tier: 'or', minPoints: 2000 },
    { tier: 'argent', minPoints: 500 },
    { tier: 'bronze', minPoints: 0 },
  ];

  it('accepte des paliers correctement décroissants', () => {
    expect(validateTierThresholdsOrder(validThresholds)).toBeNull();
  });

  it("rejette si deux paliers consécutifs ne sont pas strictement décroissants (erreur de saisie admin)", () => {
    const broken = [
      { tier: 'platine', minPoints: 5000 },
      { tier: 'or', minPoints: 500 }, // erreur : devrait être > argent
      { tier: 'argent', minPoints: 2000 },
      { tier: 'bronze', minPoints: 0 },
    ];
    const error = validateTierThresholdsOrder(broken);
    expect(error).not.toBeNull();
    expect(error).toContain('or');
    expect(error).toContain('argent');
  });

  it('rejette des paliers égaux (non strictement décroissants)', () => {
    const broken = [
      { tier: 'platine', minPoints: 5000 },
      { tier: 'or', minPoints: 5000 },
    ];
    expect(validateTierThresholdsOrder(broken)).not.toBeNull();
  });
});
