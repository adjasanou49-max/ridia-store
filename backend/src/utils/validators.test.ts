import {
  registerSchema,
  loginSchema,
  createOrderSchema,
  createDisputeSchema,
  createCouponSchema,
  addressSchema,
  resetPasswordSchema,
  updateStoreProfileSchema,
  requestPayoutSchema,
  adminUpdateOrderStatusSchema,
} from './validators';

describe('registerSchema', () => {
  it('accepte une inscription valide', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'motdepasse123',
      firstName: 'Ria',
      lastName: 'Dev',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un email invalide', () => {
    const result = registerSchema.safeParse({
      email: 'pas-un-email',
      password: 'motdepasse123',
      firstName: 'Ria',
      lastName: 'Dev',
    });
    expect(result.success).toBe(false);
  });

  it('rejette un mot de passe trop court', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: '123',
      firstName: 'Ria',
      lastName: 'Dev',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepte des identifiants valides', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejette un email manquant', () => {
    expect(loginSchema.safeParse({ password: 'x' }).success).toBe(false);
  });
});

describe('createOrderSchema', () => {
  it('accepte une commande sans code promo (optionnel)', () => {
    const result = createOrderSchema.safeParse({
      shippingAddressId: 'addr-1',
      paymentProvider: 'WAVE',
      customerPhone: '70000000',
      customerName: 'Ria Dev',
    });
    expect(result.success).toBe(true);
  });

  it('accepte une commande avec code promo', () => {
    const result = createOrderSchema.safeParse({
      shippingAddressId: 'addr-1',
      paymentProvider: 'WAVE',
      customerPhone: '70000000',
      customerName: 'Ria Dev',
      couponCode: 'BIENVENUE',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un provider de paiement inconnu', () => {
    const result = createOrderSchema.safeParse({
      shippingAddressId: 'addr-1',
      paymentProvider: 'BITCOIN',
      customerPhone: '70000000',
      customerName: 'Ria Dev',
    });
    expect(result.success).toBe(false);
  });
});

describe('createDisputeSchema', () => {
  it('rejette une description trop courte', () => {
    const result = createDisputeSchema.safeParse({
      orderId: 'order-1',
      reason: 'Non reçu',
      description: 'court',
    });
    expect(result.success).toBe(false);
  });

  it('accepte un litige complet', () => {
    const result = createDisputeSchema.safeParse({
      orderId: 'order-1',
      reason: 'Non reçu',
      description: "Ma commande n'est jamais arrivée après 3 semaines",
    });
    expect(result.success).toBe(true);
  });
});

describe('createCouponSchema', () => {
  it('accepte un coupon pourcentage valide', () => {
    const result = createCouponSchema.safeParse({
      code: 'BIENVENUE',
      type: 'PERCENTAGE',
      value: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejette une valeur négative', () => {
    const result = createCouponSchema.safeParse({
      code: 'BIENVENUE',
      type: 'PERCENTAGE',
      value: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe('addressSchema', () => {
  it('accepte une adresse complète', () => {
    const result = addressSchema.safeParse({
      fullName: 'Ria Dev',
      phone: '+22670000000',
      country: 'Burkina Faso',
      city: 'Bobo-Dioulasso',
      streetLine1: 'Secteur 12',
    });
    expect(result.success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('rejette un nouveau mot de passe trop court', () => {
    const result = resetPasswordSchema.safeParse({ token: 'abc', newPassword: '123' });
    expect(result.success).toBe(false);
  });
});

describe('updateStoreProfileSchema - correction (route sans aucune validation avant)', () => {
  it('accepte une mise à jour valide', () => {
    const result = updateStoreProfileSchema.safeParse({
      storeName: 'Ma boutique',
      storeDescription: 'Vêtements et accessoires',
      storeLogoUrl: 'https://res.cloudinary.com/demo/logo.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un nom de boutique vide/trop court', () => {
    const result = updateStoreProfileSchema.safeParse({ storeName: 'ab' });
    expect(result.success).toBe(false);
  });

  it("rejette une URL de logo invalide (avant : n'importe quelle chaîne était acceptée)", () => {
    const result = updateStoreProfileSchema.safeParse({ storeLogoUrl: 'pas-une-url' });
    expect(result.success).toBe(false);
  });

  it('accepte un objet vide (mise à jour partielle)', () => {
    const result = updateStoreProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('requestPayoutSchema - correction (NaN/négatif passait silencieusement avant)', () => {
  it('accepte une demande valide', () => {
    const result = requestPayoutSchema.safeParse({
      amountXof: 50000,
      method: 'WAVE',
      destinationRef: '+22670000000',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un montant négatif', () => {
    const result = requestPayoutSchema.safeParse({
      amountXof: -1000,
      method: 'WAVE',
      destinationRef: '+22670000000',
    });
    expect(result.success).toBe(false);
  });

  it("rejette NaN (avant : passait silencieusement le contrôle métier car 'NaN > x' est toujours faux)", () => {
    const result = requestPayoutSchema.safeParse({
      amountXof: NaN,
      method: 'WAVE',
      destinationRef: '+22670000000',
    });
    expect(result.success).toBe(false);
  });

  it('rejette une méthode de paiement inconnue', () => {
    const result = requestPayoutSchema.safeParse({
      amountXof: 5000,
      method: 'BITCOIN',
      destinationRef: '+22670000000',
    });
    expect(result.success).toBe(false);
  });

  it('rejette une référence de destination trop courte', () => {
    const result = requestPayoutSchema.safeParse({
      amountXof: 5000,
      method: 'WAVE',
      destinationRef: '1',
    });
    expect(result.success).toBe(false);
  });
});

describe('adminUpdateOrderStatusSchema - correction (statut non validé avant, erreur 500 confuse en cas de faute de frappe)', () => {
  it('accepte un statut valide', () => {
    const result = adminUpdateOrderStatusSchema.safeParse({ status: 'SHIPPED' });
    expect(result.success).toBe(true);
  });

  it('rejette un statut invalide/mal orthographié', () => {
    const result = adminUpdateOrderStatusSchema.safeParse({ status: 'SHIPED' });
    expect(result.success).toBe(false);
  });

  it('accepte une note optionnelle', () => {
    const result = adminUpdateOrderStatusSchema.safeParse({ status: 'DELIVERED', note: 'Livré en main propre' });
    expect(result.success).toBe(true);
  });
});
