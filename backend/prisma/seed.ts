import { PrismaClient, UserRole, SellerStatus, ProductStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Admin user
  const adminPassword = await bcrypt.hash('ChangeMe123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ridia-store.com' },
    create: {
      email: 'admin@ridia-store.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'Ridia',
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
    update: {},
  });

  // Categories
  const categories = [
    { name: 'Mode Femme', slug: 'mode-femme' },
    { name: 'Mode Homme', slug: 'mode-homme' },
    { name: 'Chaussures', slug: 'chaussures' },
    { name: 'Électronique', slug: 'electronique' },
    { name: 'Maison & Cuisine', slug: 'maison-cuisine' },
    { name: 'Beauté & Cosmétiques', slug: 'beaute-cosmetiques' },
    { name: 'Tissus Wax & Boubous', slug: 'tissus-wax-boubous' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: {},
    });
  }

  // Attributs de démo (Couleur/Taille) pour les catégories mode - utile pour tester
  // tout de suite les filtres et le sélecteur de variantes sans tout créer à la main.
  const attributesByCategorySlug: Record<string, { name: string; options: string[] }[]> = {
    'mode-femme': [
      { name: 'Couleur', options: ['Rouge', 'Bleu', 'Noir', 'Blanc', 'Jaune'] },
      { name: 'Taille', options: ['S', 'M', 'L', 'XL'] },
    ],
    'mode-homme': [
      { name: 'Couleur', options: ['Noir', 'Bleu marine', 'Gris', 'Blanc'] },
      { name: 'Taille', options: ['S', 'M', 'L', 'XL', 'XXL'] },
    ],
    chaussures: [
      { name: 'Couleur', options: ['Noir', 'Marron', 'Blanc'] },
      { name: 'Pointure', options: ['38', '39', '40', '41', '42', '43', '44'] },
    ],
    'tissus-wax-boubous': [{ name: 'Couleur', options: ['Rouge', 'Jaune', 'Vert', 'Multicolore'] }],
  };

  for (const [slug, attrs] of Object.entries(attributesByCategorySlug)) {
    const category = await prisma.category.findUnique({ where: { slug } });
    if (!category) continue;
    for (const attr of attrs) {
      await prisma.categoryAttribute.upsert({
        where: { id: `${category.id}-${attr.name}` }, // clé stable pour éviter les doublons au re-seed
        create: { id: `${category.id}-${attr.name}`, categoryId: category.id, name: attr.name, options: attr.options },
        update: { options: attr.options },
      });
    }
  }

  // Demo seller
  const sellerPassword = await bcrypt.hash('SellerDemo123!', 12);
  const sellerUser = await prisma.user.upsert({
    where: { email: 'seller-demo@ridia-store.com' },
    create: {
      email: 'seller-demo@ridia-store.com',
      passwordHash: sellerPassword,
      firstName: 'Ria',
      lastName: 'Demo',
      role: UserRole.SELLER,
      emailVerified: true,
    },
    update: {},
  });

  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    create: {
      userId: sellerUser.id,
      storeName: 'Ridia Shop Demo',
      storeSlug: 'ridia-shop-demo',
      storeDescription: 'Boutique de démonstration - Mode africaine',
      status: SellerStatus.APPROVED,
      commissionRate: 15,
      approvedAt: new Date(),
    },
    update: {},
  });

  // Liste noire par défaut de l'agent IA de modération - jamais montrer le fournisseur
  const defaultBlacklist = [
    'dropshipping',
    'dropship',
    '1688',
    'taobao',
    'pinduoduo',
    'alibaba',
    'aliexpress',
    'grossiste chinois',
    'fournisseur chinois',
    'import direct chine',
  ];
  for (const word of defaultBlacklist) {
    await prisma.blacklistedWord.upsert({ where: { word }, create: { word }, update: {} });
  }

  // Produits de démo - fait apparaître les sections de l'accueil (petits prix, ventes
  // flash, recommandations) qui restent cachées tant que le catalogue est vide.
  // Photos Unsplash (libres de droit) - à remplacer par de vraies photos produits
  // dès que le vrai catalogue (import fournisseur ou saisie manuelle) est en place.
  const demoProducts: {
    name: string;
    categorySlug: string;
    priceXof: number;
    images: string[];
    tags?: string[];
  }[] = [
    {
      name: 'Robe wax imprimé traditionnel',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 12500,
      images: ['https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800'],
    },
    {
      name: 'Boubou brodé homme grand boubou',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 18900,
      images: ['https://images.unsplash.com/photo-1617952236317-0e6f4e5b4b6e?w=800'],
    },
    {
      name: 'Tissu wax hollandais 6 yards',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 9500,
      images: ['https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800'],
    },
    {
      name: 'Robe d\u2019été fluide femme',
      categorySlug: 'mode-femme',
      priceXof: 7900,
      images: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800'],
    },
    {
      name: 'Ensemble tailleur femme élégant',
      categorySlug: 'mode-femme',
      priceXof: 15900,
      images: ['https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800'],
    },
    {
      name: 'Sac à main femme cuir synthétique',
      categorySlug: 'mode-femme',
      priceXof: 6500,
      images: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800'],
    },
    {
      name: 'Chemise homme coupe slim',
      categorySlug: 'mode-homme',
      priceXof: 8900,
      images: ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800'],
    },
    {
      name: 'Costume homme complet 2 pièces',
      categorySlug: 'mode-homme',
      priceXof: 34900,
      images: ['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800'],
    },
    {
      name: 'Baskets sport unisexe',
      categorySlug: 'chaussures',
      priceXof: 11900,
      images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'],
    },
    {
      name: 'Sandales cuir femme',
      categorySlug: 'chaussures',
      priceXof: 5900,
      images: ['https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800'],
    },
    {
      name: 'Écouteurs sans fil Bluetooth',
      categorySlug: 'electronique',
      priceXof: 8500,
      images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800'],
    },
    {
      name: 'Chargeur solaire portable 20000mAh',
      categorySlug: 'electronique',
      priceXof: 14900,
      images: ['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800'],
    },
    {
      name: 'Montre connectée sport',
      categorySlug: 'electronique',
      priceXof: 19900,
      images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
    },
    {
      name: 'Ensemble casseroles inox 5 pièces',
      categorySlug: 'maison-cuisine',
      priceXof: 22900,
      images: ['https://images.unsplash.com/photo-1585442222016-32e4c2a1e6c9?w=800'],
    },
    {
      name: 'Service à thé traditionnel',
      categorySlug: 'maison-cuisine',
      priceXof: 9900,
      images: ['https://images.unsplash.com/photo-1556910096-6f5e72db6803?w=800'],
    },
    {
      name: 'Parure de lit 4 pièces',
      categorySlug: 'maison-cuisine',
      priceXof: 13500,
      images: ['https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800'],
    },
    {
      name: 'Palette maquillage 18 couleurs',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 6900,
      images: ['https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800'],
    },
    {
      name: 'Coffret soin visage hydratant',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 8900,
      images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800'],
    },
  ];

  let sku = 1000;
  for (const p of demoProducts) {
    const category = await prisma.category.findUnique({ where: { slug: p.categorySlug } });
    if (!category) continue;

    const slug = p.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    sku += 1;

    const product = await prisma.product.upsert({
      where: { slug },
      create: {
        sellerId: seller.id,
        categoryId: category.id,
        name: p.name,
        slug,
        sku: `RID-${sku}`,
        description: `${p.name} - disponible en stock, livraison partout au Burkina Faso et en Afrique de l'Ouest.`,
        basePriceXof: p.priceXof,
        marginPercent: 80,
        stockQuantity: 50,
        status: ProductStatus.ACTIVE,
        tags: p.tags ?? [],
        publishedAt: new Date(),
      },
      update: {},
    });

    for (const [i, url] of p.images.entries()) {
      await prisma.productImage.upsert({
        where: { id: `${product.id}-img-${i}` },
        create: { id: `${product.id}-img-${i}`, productId: product.id, url, sortOrder: i, isPrimary: i === 0 },
        update: { url },
      });
    }
  }
  console.log(`   ${demoProducts.length} produits de démo créés/mis à jour`);

  console.log('✅ Seed completed');
  console.log(`   Admin: admin@ridia-store.com / ChangeMe123!`);
  console.log(`   Seller: seller-demo@ridia-store.com / SellerDemo123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
