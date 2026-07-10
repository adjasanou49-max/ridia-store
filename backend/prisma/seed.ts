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

  await prisma.seller.upsert({
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
