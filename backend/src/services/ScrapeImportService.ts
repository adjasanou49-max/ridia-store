import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { productService } from './ProductService';
import { reviewService } from './ReviewService';
import { categorySuggestionAgent } from '../integrations/ai/CategorySuggestionAgent';

interface ScrapedVariantInput {
  name: string;
  attributes?: Record<string, string>;
  priceCny: number;
  stock: number;
  weightKg?: number | null;
  imageUrl?: string;
}

interface ScrapedReviewInput {
  rating: number;
  comment?: string;
  imageUrls?: string[];
  authorName?: string;
}

export interface ScrapeImportInput {
  sourceUrl: string;
  sourceProductId: string;
  title: string;
  description: string;
  mediaUrls: { images: string[]; videos: string[] };
  variants: ScrapedVariantInput[];
  defaultWeightKg?: number | null;
  reviews?: ScrapedReviewInput[];
}

export class ScrapeImportService {
  /**
   * Transforme le JSON produit par le scraper en un vrai produit Ridia :
   * - Devine la catégorie via l'agent IA si le vendeur n'en précise pas une
   * - Le produit "de base" reprend le prix de la variante la moins chère
   *   (prix "à partir de", cohérent avec l'affichage catalogue)
   * - Chaque variante est recréée avec SA propre marge (même taux/formule
   *   que le produit de base, pour rester cohérent sur toute la fiche)
   * - Les avis sont importés tels quels (source IMPORTED, déjà approuvés)
   */
  async importScrapedProduct(
    sellerId: string,
    input: ScrapeImportInput,
    categoryId?: string
  ): Promise<{ productId: string; variantCount: number; reviewCount: number }> {
    if (input.variants.length === 0) {
      throw new AppError('Aucune variante trouvée dans les données scrapées', 422);
    }

    const resolvedCategoryId = categoryId ?? (await this.suggestCategory(input.title, input.description));

    const cheapestVariant = input.variants.reduce((min, v) => (v.priceCny < min.priceCny ? v : min));
    const totalStock = input.variants.reduce((sum, v) => sum + v.stock, 0);

    const product = await productService.createProduct({
      sellerId,
      categoryId: resolvedCategoryId,
      name: input.title,
      description: input.description || input.title,
      costPriceCny: cheapestVariant.priceCny,
      stockQuantity: totalStock,
      images: input.mediaUrls.images,
      videoUrl: input.mediaUrls.videos[0],
      weight: input.defaultWeightKg ?? undefined,
      sourceLanguage: 'zh',
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { sourceUrl: input.sourceUrl, sourceProductId: input.sourceProductId },
    });

    let variantCount = 0;
    if (input.variants.length > 1) {
      const rate = await productService.getCurrentExchangeRate();
      const marginPercent = await productService.getDefaultMarginForCategory(resolvedCategoryId);

      if (marginPercent != null) {
        for (const variant of input.variants) {
          await productService.addVariant(product.id, sellerId, {
            name: variant.name,
            priceXof: productService.calculatePriceXof(variant.priceCny, marginPercent, rate),
            stockQuantity: variant.stock,
            attributes: variant.attributes,
            weightKg: variant.weightKg ?? undefined,
            imageUrl: variant.imageUrl,
          });
          variantCount++;
        }
      }
    }

    let reviewCount = 0;
    if (input.reviews && input.reviews.length > 0) {
      await reviewService.bulkImportReviews(
        product.id,
        input.reviews.map((r) => ({
          authorName: r.authorName || 'Client',
          rating: r.rating,
          comment: r.comment,
          imageUrls: r.imageUrls,
        }))
      );
      reviewCount = input.reviews.length;
    }

    return { productId: product.id, variantCount, reviewCount };
  }

  private async suggestCategory(title: string, description: string): Promise<string> {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (categories.length === 0) {
      throw new AppError("Aucune catégorie existante - crée au moins une catégorie avant d'importer", 422);
    }
    const suggestion = await categorySuggestionAgent.suggestCategory(title, description, categories);
    return suggestion.categoryId;
  }
}

export const scrapeImportService = new ScrapeImportService();
