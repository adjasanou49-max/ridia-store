import { logger } from '../../config/logger';
import { SourcingAdapter, RawSourceProduct } from './SourcingAdapter';

export class PinduoduoAdapter implements SourcingAdapter {
  readonly sourceName = 'PINDUODUO';

  async searchProducts(keyword: string): Promise<RawSourceProduct[]> {
    logger.info('[Pinduoduo] Recherche manuelle requise', { keyword });
    return [];
  }

  async getProductDetail(): Promise<RawSourceProduct | null> {
    return null;
  }

  parseManualEntry(input: {
    url: string;
    name: string;
    description?: string;
    priceCny: number;
    moq?: number;
    images?: string[];
    attributes?: Record<string, string>;
  }): RawSourceProduct {
    return {
      sourceProductId: input.url,
      sourceUrl: input.url,
      name: input.name,
      description: input.description || '',
      priceCny: input.priceCny,
      minOrderQuantity: input.moq || 1,
      images: input.images || [],
      attributes: input.attributes || {},
    };
  }
}

export const pinduoduoAdapter = new PinduoduoAdapter();
