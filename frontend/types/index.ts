// ============================================================================
// Types partagés - doivent rester synchronisés avec backend/prisma/schema.prisma
// ============================================================================

export type UserRole =
  | 'CUSTOMER'
  | 'SELLER'
  | 'ADMIN'
  | 'PURCHASING_AGENT'
  | 'MARKETING_AGENT'
  | 'SALES_AGENT'
  | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl?: string | null;
  notifyByEmail: boolean;
  notifyByWhatsapp: boolean;
  marketingOptIn: boolean;
  seller?: Seller | null;
  createdAt: string;
}

export type SellerStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface Seller {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  storeDescription?: string | null;
  storeLogoUrl?: string | null;
  status: SellerStatus;
  commissionRate: number;
  rating: number;
  reviewCount: number;
  isVerifiedBadge: boolean;
}

export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface ProductImage {
  id: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  name: string;
  attributes?: Record<string, unknown>;
  priceXof: number;
  stockQuantity: number;
  weightKg?: number | null;
  imageUrl?: string | null;
  isActive: boolean;
}

export interface CategoryAttribute {
  id: string;
  name: string;
  options: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  iconUrl?: string | null;
  children?: Category[];
  attributes?: CategoryAttribute[];
}

export interface PriceTier {
  id: string;
  minQuantity: number;
  pricePerUnitXof: number;
}

export interface ProductReview {
  id: string;
  source: 'ORGANIC' | 'IMPORTED';
  authorName?: string | null;
  rating: number;
  comment?: string | null;
  imageUrls: string[];
  createdAt: string;
  user?: { firstName: string; avatarUrl?: string | null } | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  basePriceXof: number;
  compareAtPriceXof?: number | null;
  stockQuantity: number;
  reservedStock: number;
  brand?: string | null;
  weight?: number | null;
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  viewCount: number;
  salesCount: number;
  rating: number;
  reviewCount: number;
  images: ProductImage[];
  variants: ProductVariant[];
  priceTiers?: PriceTier[];
  videoUrl?: string | null;
  scheduledPriceIncreaseAt?: string | null;
  priceAfterIncrease?: number | null;
  reviews?: ProductReview[];
  seller?: { storeName: string; storeSlug: string };
  category?: Category;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: Product;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  product: Product;
  variant?: ProductVariant | null;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'DISPUTED';

export type PaymentProvider = 'WAVE' | 'ORANGE_MONEY' | 'MTN_MONEY' | 'CUSTOM';

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  quantity: number;
  unitPriceXof: number;
  totalXof: number;
  status: OrderStatus;
  trackingNumber?: string | null;
  product?: { images: ProductImage[] };
}

export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  note?: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalXof: number;
  shippingFeeXof: number;
  totalXof: number;
  items: OrderItem[];
  statusHistory?: OrderStatusHistoryEntry[];
  createdAt: string;
  deliveredAt?: string | null;
}

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  district?: string | null;
  streetLine1: string;
  streetLine2?: string | null;
  landmark?: string | null;
  isDefault: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
