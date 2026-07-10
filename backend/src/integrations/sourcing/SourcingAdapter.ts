export interface RawSourceProduct {
  sourceProductId: string;
  sourceUrl: string;
  name: string;
  description: string;
  priceCny: number;
  minOrderQuantity: number;
  images: string[];
  attributes: Record<string, string>;
  sellerName?: string;
  sellerRating?: number;
}

export interface SourcingAdapter {
  readonly sourceName: string;
  /** Search products by keyword (used for manual import assist) */
  searchProducts(keyword: string, page?: number): Promise<RawSourceProduct[]>;
  /** Fetch single product detail by source ID/URL */
  getProductDetail(sourceProductId: string): Promise<RawSourceProduct | null>;
}
