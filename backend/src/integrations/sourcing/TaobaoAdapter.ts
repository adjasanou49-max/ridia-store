import { logger } from '../../config/logger';
import { SourcingAdapter, RawSourceProduct } from './SourcingAdapter';

/**
 * Taobao (domestic Chinese marketplace) - même contrainte que 1688:
 * pas d'API ouverte pour acheteurs étrangers. Import manuel supporté.
 */
export class TaobaoAdapter implements SourcingAdapter {
  readonly sourceName = 'TAOBAO';

  async searchProducts(keyword: string): Promise<RawSourceProduct[]> {
    logger.info('[Taobao] Recherche manuelle requise', { keyword });
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

export const taobaoAdapter = new TaobaoAdapter();
