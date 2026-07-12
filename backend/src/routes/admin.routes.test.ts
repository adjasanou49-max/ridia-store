jest.mock('../services/SellerService', () => ({ sellerService: {} }));
jest.mock('../services/OrderService', () => ({ orderService: {} }));
jest.mock('../services/ProductService', () => ({ productService: {} }));
jest.mock('../config/prisma', () => ({ prisma: {} }));
jest.mock('../integrations/ai/ContentModerationAgent', () => ({ contentModerationAgent: {} }));
jest.mock('../services/DisputeService', () => ({ disputeService: {} }));
jest.mock('../services/CouponService', () => ({ couponService: {} }));
jest.mock('../services/AdminInviteService', () => ({ adminInviteService: {} }));

import { canDeactivateTarget } from './admin.routes';

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
