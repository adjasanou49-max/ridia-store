import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { translationAdapter } from '../integrations/translation/TranslationAdapter';
import { contentModerationAgent } from '../integrations/ai/ContentModerationAgent';

interface PriceTierInput {
  minQuantity: number;
  pricePerUnitXof: number;
}

interface CreateProductInput {
  sellerId: string;
  categoryId: string;
  name: string;
  description: string;
  costPriceCny?: number;
  marginPercent?: number;
  basePriceXof?: number;
  stockQuantity: number;
  brand?: string;
  weight?: number;
  images: string[];
  videoUrl?: string;
  attributes?: Record<string, unknown>;
  tags?: string[];
  /** Prix dégressifs par quantité, ex: [{minQuantity: 2, pricePerUnitXof: 8500}] */
  priceTiers?: PriceTierInput[];
  /**
   * Langue d'origine du nom/description fournis (ex: "zh" pour du chinois brut copié
   * depuis 1688/Taobao). Si renseigné, le texte est automatiquement traduit vers le
   * français avant d'être stocké comme name/description ; l'original est conservé
   * dans originalName/originalDescription pour référence ou retraduction future.
   */
  sourceLanguage?: string;
}

interface SearchFilters {
  query?: string;
  categoryId?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'rating';
  page?: number;
  pageSize?: number;
  /** Filtre par valeurs d'attribut, ex: { "Couleur": "Rouge", "Taille": "L" } */
  attributes?: Record<string, string>;
}

// Champs sûrs à exposer publiquement (jamais costPriceCny / exchangeRate / costPriceXof /
// marginPercent - ce sont des données internes vendeur, pas des infos client).
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  sku: true,
  description: true,
  basePriceXof: true,
  stockQuantity: true,
  scheduledPriceIncreaseAt: true,
  priceAfterIncrease: true,
  brand: true,
  weight: true,
  tags: true,
  status: true,
  viewCount: true,
  salesCount: true,
  rating: true,
  reviewCount: true,
  publishedAt: true,
  createdAt: true,
} satisfies Prisma.ProductSelect;

export class ProductService {
  /** Récupère le taux CNY->XOF actuel : priorité au paramètre admin (SystemSetting), sinon env par défaut */
  async getCurrentExchangeRate(): Promise<number> {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'cnyToXofRate' } });
    return setting ? Number(setting.value) : env.CNY_TO_XOF_RATE;
  }

  /**
   * Marge à appliquer automatiquement quand le vendeur n'en fournit pas explicitement :
   * 1) marge propre à la catégorie (réglée par l'admin dans /admin/categories)
   * 2) marge système par défaut (réglée dans /admin/settings)
   * 3) 80% en dernier recours
   */
  /**
   * Marge à appliquer quand le vendeur n'en fournit pas explicitement :
   * 1) marge propre à la catégorie (réglée par le SUPER_ADMIN dans /admin/categories)
   * 2) marge système par défaut (réglée par le SUPER_ADMIN dans /admin/settings)
   * Aucun fallback caché à un pourcentage arbitraire : tant que rien n'est configuré,
   * la création échoue explicitement plutôt que d'appliquer une marge non voulue.
   */
  async getDefaultMarginForCategory(categoryId: string): Promise<number | null> {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { defaultMarginPercent: true },
    });
    if (category?.defaultMarginPercent != null) return category.defaultMarginPercent;

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'defaultMarginPercent' } });
    return setting ? Number(setting.value) : null;
  }

  /** Calcule le prix final en cascade: CNY -> XOF -> + marge (usage interne vendeur uniquement) */
  calculatePriceXof(costPriceCny: number, marginPercent: number, exchangeRate?: number): number {
    const rate = exchangeRate ?? env.CNY_TO_XOF_RATE;
    const costXof = costPriceCny * rate;
    const finalPrice = costXof * (1 + marginPercent / 100);
    // Round to nearest 50 XOF (common practice in West Africa)
    return Math.round(finalPrice / 50) * 50;
  }

  /**
   * Détermine le prix unitaire applicable pour une quantité donnée, en tenant compte
   * des paliers dégressifs (style 1688/Taobao/Pinduoduo). Le palier avec le minQuantity
   * le plus élevé qui reste <= quantity l'emporte. Sans palier correspondant, on retombe
   * sur basePriceXof (prix unitaire standard, quantité 1).
   */
  getUnitPriceForQuantity(
    product: { basePriceXof: number | Prisma.Decimal; priceTiers?: { minQuantity: number; pricePerUnitXof: number | Prisma.Decimal }[] },
    quantity: number
  ): number {
    const tiers = product.priceTiers ?? [];
    const applicable = tiers
      .filter((t) => quantity >= t.minQuantity)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];
    return Number(applicable ? applicable.pricePerUnitXof : product.basePriceXof);
  }

  private validatePriceTiers(tiers: PriceTierInput[] | undefined, basePriceXof: number) {
    if (!tiers || tiers.length === 0) return;
    const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    for (const tier of sorted) {
      if (tier.minQuantity < 2) {
        throw new AppError('Un palier de prix doit commencer à partir de 2 unités minimum', 422);
      }
      if (tier.pricePerUnitXof <= 0 || tier.pricePerUnitXof >= basePriceXof) {
        throw new AppError(
          'Le prix dégressif doit être positif et inférieur au prix unitaire de base',
          422
        );
      }
    }
  }

  async createProduct(input: CreateProductInput) {
    const rate = await this.getCurrentExchangeRate();
    const costPriceXof = input.costPriceCny ? input.costPriceCny * rate : undefined;

    // Priorité de la marge : explicite fournie > marge par défaut de la catégorie
    // (réglée par l'admin dans /admin/categories) > marge système par défaut (SystemSetting)
    // > 80% en dernier recours.
    const marginPercent = input.marginPercent ?? (await this.getDefaultMarginForCategory(input.categoryId));

    if (marginPercent == null) {
      throw new AppError(
        'Aucune marge configurée pour cette catégorie ni marge par défaut globale. ' +
          'Demande au propriétaire de la configurer dans Paramètres système ou Catégories, ' +
          'ou fournis une marge explicite pour ce produit.',
        422
      );
    }

    const basePriceXof =
      input.basePriceXof ??
      (input.costPriceCny
        ? this.calculatePriceXof(input.costPriceCny, marginPercent, rate)
        : 0);

    if (basePriceXof <= 0) {
      throw new AppError('Prix de vente invalide - fournir costPriceCny ou basePriceXof', 422);
    }

    this.validatePriceTiers(input.priceTiers, basePriceXof);

    // Traduction automatique si le texte fourni est dans une langue source (ex: chinois
    // brut copié depuis 1688/Taobao/Pinduoduo). L'original est conservé pour référence.
    let finalName = input.name;
    let finalDescription = input.description;
    let originalName: string | undefined;
    let originalDescription: string | undefined;

    if (input.sourceLanguage && input.sourceLanguage !== env.TRANSLATION.defaultTargetLang) {
      originalName = input.name;
      originalDescription = input.description;
      [finalName, finalDescription] = await Promise.all([
        translationAdapter.translate(input.name, env.TRANSLATION.defaultTargetLang, input.sourceLanguage),
        translationAdapter.translate(input.description, env.TRANSLATION.defaultTargetLang, input.sourceLanguage),
      ]);
    }

    // Agent IA de modération : retire systématiquement toute mention du fournisseur
    // (1688, Taobao, Pinduoduo, dropshipping, etc.) - jamais montré au client, quelle
    // que soit la source (import fournisseur ou saisie manuelle du vendeur).
    finalName = await contentModerationAgent.sanitizeDescription(finalName);
    finalDescription = await contentModerationAgent.sanitizeDescription(finalDescription);

    const slug = `${slugify(finalName, { lower: true, strict: true })}-${nanoid(6)}`;
    const sku = `RID-${nanoid(10).toUpperCase()}`;

    const product = await prisma.product.create({
      data: {
        sellerId: input.sellerId,
        categoryId: input.categoryId,
        name: finalName,
        slug,
        description: finalDescription,
        originalName,
        originalDescription,
        sourceLanguage: input.sourceLanguage,
        videoUrl: input.videoUrl,
        sku,
        costPriceCny: input.costPriceCny,
        exchangeRate: rate,
        costPriceXof,
        marginPercent,
        basePriceXof,
        stockQuantity: input.stockQuantity,
        brand: input.brand,
        weight: input.weight,
        attributes: input.attributes as Prisma.InputJsonValue,
        tags: input.tags || [],
        status: ProductStatus.PENDING_REVIEW,
        images: {
          create: input.images.map((url, idx) => ({
            url,
            sortOrder: idx,
            isPrimary: idx === 0,
          })),
        },
        priceTiers: input.priceTiers?.length
          ? {
              create: input.priceTiers.map((t) => ({
                minQuantity: t.minQuantity,
                pricePerUnitXof: t.pricePerUnitXof,
              })),
            }
          : undefined,
      },
      include: { images: true, category: true, priceTiers: true },
    });

    return product;
  }

  /** Remplace intégralement les paliers de prix d'un produit (le vendeur uniquement) */
  async setPriceTiers(productId: string, sellerId: string, tiers: PriceTierInput[]) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    this.validatePriceTiers(tiers, Number(product.basePriceXof));

    await prisma.$transaction([
      prisma.productPriceTier.deleteMany({ where: { productId } }),
      ...(tiers.length
        ? [
            prisma.productPriceTier.createMany({
              data: tiers.map((t) => ({
                productId,
                minQuantity: t.minQuantity,
                pricePerUnitXof: t.pricePerUnitXof,
              })),
            }),
          ]
        : []),
    ]);

    return prisma.productPriceTier.findMany({
      where: { productId },
      orderBy: { minQuantity: 'asc' },
    });
  }

  /** Vue PUBLIQUE d'un produit - ne renvoie jamais coût CNY / marge / taux de change */
  async getProductBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: {
        ...PUBLIC_PRODUCT_SELECT,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true } },
        priceTiers: { orderBy: { minQuantity: 'asc' } },
        attributeValues: { select: { value: true, attribute: { select: { name: true } } } },
        category: true,
        reviews: {
          where: { status: 'APPROVED' },
          take: 20,
          // Avis positifs (3-5★) en premier, négatifs (1-2★) en dernier - jamais masqués
          orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            source: true,
            authorName: true,
            rating: true,
            comment: true,
            imageUrls: true,
            createdAt: true,
            isAnonymous: true,
            user: { select: { firstName: true, avatarUrl: true } },
          },
        },
        // Pas d'info vendeur exposée publiquement - Ridia Store affiche l'article,
        // pas le fournisseur (choix produit assumé).
      },
    });

    if (!product) throw new AppError('Produit non trouvé', 404);

    // increment view count async (fire and forget)
    prisma.product.update({ where: { id: product.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    // Masque le prénom des avis publiés anonymement - la vraie donnée reste en base
    product.reviews = product.reviews.map((r) =>
      r.isAnonymous ? { ...r, user: { firstName: 'Client', avatarUrl: null } } : r
    );

    return product;
  }

  /** Vue vendeur (son propre produit) - inclut coût/marge, réservé à son dashboard */
  async getOwnProductById(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId },
      include: { images: true, variants: true, priceTiers: { orderBy: { minQuantity: 'asc' } }, category: true },
    });
    if (!product) throw new AppError('Produit non trouvé', 404);
    return product;
  }

  async searchProducts(filters: SearchFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 24, 100);

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.sellerId && { sellerId: filters.sellerId }),
      ...(filters.inStockOnly && { stockQuantity: { gt: 0 } }),
      ...(filters.minPrice || filters.maxPrice
        ? {
            basePriceXof: {
              ...(filters.minPrice && { gte: filters.minPrice }),
              ...(filters.maxPrice && { lte: filters.maxPrice }),
            },
          }
        : {}),
      ...(filters.query && {
        OR: [
          { name: { contains: filters.query, mode: 'insensitive' } },
          { description: { contains: filters.query, mode: 'insensitive' } },
          { tags: { has: filters.query.toLowerCase() } },
        ],
      }),
      ...(filters.attributes &&
        Object.keys(filters.attributes).length > 0 && {
          AND: Object.entries(filters.attributes).map(([attrName, value]) => ({
            attributeValues: {
              some: { attribute: { name: attrName }, value },
            },
          })),
        }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      filters.sortBy === 'price_asc'
        ? { basePriceXof: 'asc' }
        : filters.sortBy === 'price_desc'
        ? { basePriceXof: 'desc' }
        : filters.sortBy === 'popular'
        ? { salesCount: 'desc' }
        : filters.sortBy === 'rating'
        ? { rating: 'desc' }
        : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...PUBLIC_PRODUCT_SELECT,
          images: { where: { isPrimary: true }, take: 1 },
          // Seulement le palier le plus avantageux, pour afficher "dès X FCFA" sur la carte produit
          priceTiers: { orderBy: { minQuantity: 'desc' }, take: 1 },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async updateStock(productId: string, delta: number) {
    return prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: { increment: delta } },
    });
  }

  async publishProduct(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    return prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
    });
  }

  /** Édition d'un produit existant par son propriétaire (ou un admin) */
  async updateProduct(
    productId: string,
    sellerId: string,
    input: Partial<{
      name: string;
      description: string;
      categoryId: string;
      basePriceXof: number;
      stockQuantity: number;
      brand: string;
      weight: number;
      tags: string[];
      images: string[];
    }>
  ) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    const { images, ...rest } = input;

    // Modération IA aussi à l'édition - un vendeur pourrait coller du texte contenant
    // encore des mentions fournisseur après coup.
    if (rest.name) rest.name = await contentModerationAgent.sanitizeDescription(rest.name);
    if (rest.description) rest.description = await contentModerationAgent.sanitizeDescription(rest.description);

    return prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productImage.createMany({
          data: images.map((url, idx) => ({ productId, url, sortOrder: idx, isPrimary: idx === 0 })),
        });
      }

      return tx.product.update({
        where: { id: productId },
        data: rest,
        include: { images: true, priceTiers: true, category: true },
      });
    });
  }

  /** Suppression (archivage) d'un produit - on ne supprime jamais physiquement un produit
   * qui a potentiellement déjà des commandes liées (contrainte d'intégrité + historique). */
  async archiveProduct(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    return prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  /** Réactivation d'un produit archivé. Repasse en DRAFT (et non ACTIVE directement) :
   * le vendeur peut avoir besoin de mettre à jour stock/prix avant de republier,
   * et ça garde le même parcours que la création (publishProduct pour le remettre en ligne). */
  async unarchiveProduct(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);
    if (product.status !== ProductStatus.ARCHIVED) {
      throw new AppError("Ce produit n'est pas archivé", 400);
    }

    return prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.DRAFT },
    });
  }

  // ==========================================================================
  // VARIANTES (tailles, couleurs) - stock et prix distincts par combinaison
  // ==========================================================================

  async getVariants(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);
    return prisma.productVariant.findMany({ where: { productId }, orderBy: { name: 'asc' } });
  }

  async addVariant(
    productId: string,
    sellerId: string,
    input: {
      name: string;
      priceXof: number;
      stockQuantity: number;
      attributes?: Record<string, string>;
      imageUrl?: string;
      weightKg?: number;
    }
  ) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    return prisma.productVariant.create({
      data: {
        productId,
        name: input.name,
        priceXof: input.priceXof,
        stockQuantity: input.stockQuantity,
        attributes: input.attributes as Prisma.InputJsonValue,
        imageUrl: input.imageUrl,
        weightKg: input.weightKg,
      },
    });
  }

  async updateVariant(
    variantId: string,
    sellerId: string,
    input: Partial<{ name: string; priceXof: number; stockQuantity: number; isActive: boolean; weightKg: number }>
  ) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, product: { sellerId } },
    });
    if (!variant) throw new AppError('Variante non trouvée', 404);

    return prisma.productVariant.update({ where: { id: variantId }, data: input });
  }

  async deleteVariant(variantId: string, sellerId: string) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, product: { sellerId } },
    });
    if (!variant) throw new AppError('Variante non trouvée', 404);

    await prisma.productVariant.delete({ where: { id: variantId } });
  }

  // ==========================================================================
  // PRIX PROGRAMMÉ À LA HAUSSE - urgence client, style Temu/Pinduoduo
  // ==========================================================================

  /** Programme une hausse de prix à une date donnée - crée un compte à rebours côté client */
  async schedulePriceIncrease(
    productId: string,
    sellerId: string,
    scheduledAt: Date,
    newPriceXof: number
  ) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    if (scheduledAt <= new Date()) {
      throw new AppError('La date de hausse doit être dans le futur', 422);
    }
    if (newPriceXof <= Number(product.basePriceXof)) {
      throw new AppError('Le nouveau prix doit être supérieur au prix actuel', 422);
    }

    return prisma.product.update({
      where: { id: productId },
      data: { scheduledPriceIncreaseAt: scheduledAt, priceAfterIncrease: newPriceXof },
    });
  }

  /** Annule une hausse de prix programmée */
  async cancelScheduledPriceIncrease(productId: string, sellerId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    return prisma.product.update({
      where: { id: productId },
      data: { scheduledPriceIncreaseAt: null, priceAfterIncrease: null },
    });
  }

  /**
   * Applique toutes les hausses de prix dont l'échéance est passée. Appelé
   * périodiquement par un job BullMQ répétitif (voir queues/worker.ts) - garantit que
   * le prix affiché en liste (pas seulement sur la fiche produit) reste à jour.
   */
  async applyDuePriceIncreases(): Promise<number> {
    const due = await prisma.product.findMany({
      where: { scheduledPriceIncreaseAt: { lte: new Date() } },
      select: { id: true, priceAfterIncrease: true },
    });

    if (due.length === 0) return 0;

    await prisma.$transaction(
      due.map((p) =>
        prisma.product.update({
          where: { id: p.id },
          data: {
            basePriceXof: p.priceAfterIncrease!,
            scheduledPriceIncreaseAt: null,
            priceAfterIncrease: null,
          },
        })
      )
    );

    return due.length;
  }

  // ==========================================================================
  // AUDIT & CORRECTION DES MARGES - réservé au SUPER_ADMIN (voir admin.routes.ts)
  // ==========================================================================

  /**
   * Liste tous les produits avec leur coût, marge actuelle et prix de vente, pour
   * vérification/correction par le propriétaire. Signale les produits à marge
   * suspecte (très faible ou négative après frais) pour attirer l'œil rapidement.
   */
  async listProductMargins(filters: { categoryId?: string; belowMargin?: number; page?: number; pageSize?: number }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 200);

    const where: Prisma.ProductWhereInput = {
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.belowMargin != null && { marginPercent: { lt: filters.belowMargin } }),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { marginPercent: 'asc' }, // les marges les plus basses en premier - à vérifier en priorité
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          sku: true,
          status: true,
          costPriceCny: true,
          costPriceXof: true,
          marginPercent: true,
          basePriceXof: true,
          stockQuantity: true,
          salesCount: true,
          category: { select: { id: true, name: true, defaultMarginPercent: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Corrige la marge d'un produit précis et recalcule son prix de vente en conséquence */
  async correctProductMargin(productId: string, newMarginPercent: number) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Produit non trouvé', 404);
    if (!product.costPriceCny) {
      throw new AppError('Ce produit n\'a pas de coût CNY renseigné - impossible de recalculer le prix', 422);
    }

    const rate = product.exchangeRate ?? (await this.getCurrentExchangeRate());
    const newPrice = this.calculatePriceXof(Number(product.costPriceCny), newMarginPercent, rate);

    return prisma.product.update({
      where: { id: productId },
      data: { marginPercent: newMarginPercent, basePriceXof: newPrice },
    });
  }

  /**
   * Corrige la marge de plusieurs produits d'un coup (par catégorie ou par liste d'IDs)
   * et recalcule chaque prix de vente. Retourne le nombre de produits mis à jour.
   */
  async bulkCorrectMargin(input: { categoryId?: string; productIds?: string[]; newMarginPercent: number }) {
    if (!input.categoryId && !input.productIds?.length) {
      throw new AppError('Fournir categoryId ou productIds', 422);
    }

    const products = await prisma.product.findMany({
      where: {
        ...(input.categoryId && { categoryId: input.categoryId }),
        ...(input.productIds?.length && { id: { in: input.productIds } }),
        costPriceCny: { not: null },
      },
    });

    const rate = await this.getCurrentExchangeRate();

    await prisma.$transaction(
      products.map((p) =>
        prisma.product.update({
          where: { id: p.id },
          data: {
            marginPercent: input.newMarginPercent,
            basePriceXof: this.calculatePriceXof(
              Number(p.costPriceCny),
              input.newMarginPercent,
              p.exchangeRate ?? rate
            ),
          },
        })
      )
    );

    return { updatedCount: products.length };
  }
}

export const productService = new ProductService();
