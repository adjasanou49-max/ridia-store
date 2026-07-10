import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const priceTierSchema = z.object({
  minQuantity: z.number().int().min(2, 'Le palier doit commencer à partir de 2 unités'),
  pricePerUnitXof: z.number().positive(),
});

export const createProductSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(3),
  description: z.string().min(10),
  costPriceCny: z.number().positive().optional(),
  basePriceXof: z.number().positive().optional(),
  marginPercent: z.number().min(0).max(500).optional(),
  stockQuantity: z.number().int().min(0),
  brand: z.string().optional(),
  weight: z.number().positive().optional(),
  images: z.array(z.string().url()).min(1, 'Au moins une image requise'),
  attributes: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  priceTiers: z.array(priceTierSchema).optional(),
});

export const updatePriceTiersSchema = z.object({
  tiers: z.array(priceTierSchema),
});

export const addToCartSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(100),
});

export const createOrderSchema = z.object({
  shippingAddressId: z.string(),
  paymentProvider: z.enum(['CINETPAY', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'CUSTOM']),
  customerPhone: z.string().min(8),
  customerName: z.string().min(2),
  couponCode: z.string().optional(),
  pointsToRedeem: z.number().int().nonnegative().optional(),
});

export const sellerApplicationSchema = z.object({
  storeName: z.string().min(3),
  storeDescription: z.string().optional(),
});

export const bulkImportSchema = z.object({
  source: z.enum(['ALIBABA_1688', 'TAOBAO', 'PINDUODUO', 'MANUAL', 'CSV_UPLOAD']),
  rows: z
    .array(
      z.object({
        url: z.string(),
        name: z.string(),
        description: z.string().optional(),
        priceCny: z.number().positive(),
        moq: z.number().optional(),
        images: z.array(z.string()).optional(),
        videoUrl: z.string().optional(),
        sourceLanguage: z.string().optional(), // ex: "zh" (chinois) - défaut si absent
        weight: z.number().positive().optional(), // poids en kg, pour le calcul de livraison
        categoryId: z.string().optional(), // si absent, l'agent IA suggère automatiquement
        stockQuantity: z.number().int().min(0),
        marginPercent: z.number().optional(),
        reviews: z
          .array(
            z.object({
              authorName: z.string(),
              rating: z.number().int().min(1).max(5),
              comment: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .min(1)
    .max(1000, 'Maximum 1000 produits par requête - envoie en plusieurs lots pour un catalogue plus large'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  avatarUrl: z.string().url().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères'),
});

export const privacySettingsSchema = z.object({
  notifyByEmail: z.boolean().optional(),
  notifyByWhatsapp: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

export const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(8),
  country: z.string().optional(),
  city: z.string().min(1),
  district: z.string().optional(),
  streetLine1: z.string().min(1),
  streetLine2: z.string().optional(),
  landmark: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  categoryId: z.string().optional(),
  basePriceXof: z.number().positive().optional(),
  stockQuantity: z.number().int().min(0).optional(),
  brand: z.string().optional(),
  weight: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string().url()).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

export const createDisputeSchema = z.object({
  orderId: z.string(),
  reason: z.string().min(3),
  description: z.string().min(10),
  imageUrls: z.array(z.string().url()).optional(),
});

export const createCouponSchema = z.object({
  code: z.string().min(3),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  value: z.number().positive(),
  minOrderXof: z.number().positive().optional(),
  maxUses: z.number().int().positive().optional(),
  maxUsesPerUser: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
});
