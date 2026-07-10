import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { SourcingAdapter, RawSourceProduct } from './SourcingAdapter';

/**
 * 1688.com n'offre pas d'API publique simple pour acheteurs étrangers.
 * Ce connecteur supporte 2 modes:
 *  - "manual": l'admin/vendeur importe via CSV ou colle une URL produit,
 *    et ce connecteur scrape/parse les métadonnées de base (à compléter
 *    avec un service de scraping tiers si besoin).
 *  - "api": si un compte Premium Supplier / API partenaire est obtenu plus tard.
 */
export class Alibaba1688Adapter implements SourcingAdapter {
  readonly sourceName = 'ALIBABA_1688';

  async searchProducts(keyword: string): Promise<RawSourceProduct[]> {
    if (env.CONNECTORS.alibaba1688Mode === 'manual') {
      logger.info('[1688] Mode manuel - recherche non automatisée', { keyword });
      return [];
    }
    // Placeholder for future official API integration
    return [];
  }

  async getProductDetail(sourceProductId: string): Promise<RawSourceProduct | null> {
    if (env.CONNECTORS.alibaba1688Mode === 'manual') {
      logger.info('[1688] getProductDetail en mode manuel - utiliser import CSV/URL', {
        sourceProductId,
      });
      return null;
    }
    return null;
  }

  /**
   * Parse manually-provided product data (from CSV row or admin form)
   * into the standard RawSourceProduct shape. Used by ProductImportService.
   */
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

export const alibaba1688Adapter = new Alibaba1688Adapter();
