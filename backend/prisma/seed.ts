import { PrismaClient, UserRole, SellerStatus, ProductStatus, SalesAgentStatus } from '@prisma/client';
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

  // Boutique officielle Ridia Store, rattachée au compte super-admin lui-même.
  // Sans ça, le compte admin peut voir la page "Mes produits" (l'UI le laisse
  // passer) mais l'ajout échoue côté serveur avec "Compte vendeur requis" -
  // il faut un vrai profil Seller relié à ce user pour pouvoir créer des produits.
  await prisma.seller.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      storeName: 'Ridia Store',
      storeSlug: 'ridia-store-officiel',
      storeDescription: 'Boutique officielle Ridia Store.',
      status: SellerStatus.APPROVED,
      commissionRate: 0,
      approvedAt: new Date(),
    },
    update: { status: SellerStatus.APPROVED },
  });


  const categories = [
    // --- Catégories existantes (slugs inchangés, des produits leur sont déjà rattachés) ---
    { name: 'Mode Femme', slug: 'mode-femme' },
    { name: 'Mode Homme', slug: 'mode-homme' },
    { name: 'Chaussures', slug: 'chaussures' },
    { name: 'Électronique', slug: 'electronique' },
    { name: 'Maison & Cuisine', slug: 'maison-cuisine' },
    { name: 'Beauté & Cosmétiques', slug: 'beaute-cosmetiques' },
    { name: 'Tenues Traditionnelles', slug: 'tissus-wax-boubous' },
    // --- Nouvelles catégories - structure complète façon marketplace pro,
    // même si tous les rayons ne sont pas encore fournis en produits ---
    { name: 'Mode Enfant', slug: 'mode-enfant' },
    { name: 'Sacs & Maroquinerie', slug: 'sacs-maroquinerie' },
    { name: 'Sous-vêtements & Lingerie', slug: 'sous-vetements-lingerie' },
    { name: 'Bijoux & Accessoires', slug: 'bijoux-accessoires' },
    { name: 'Cheveux & Perruques', slug: 'cheveux-perruques' },
    { name: 'Téléphones & Accessoires', slug: 'telephones-accessoires' },
    { name: 'Informatique', slug: 'informatique' },
    { name: 'Décoration Maison', slug: 'decoration-maison' },
    { name: 'Linge de Maison', slug: 'linge-maison' },
    { name: 'Électroménager', slug: 'electromenager' },
    { name: 'Meubles', slug: 'meubles' },
    { name: 'Jardin & Extérieur', slug: 'jardin-exterieur' },
    { name: 'Bricolage & Outils', slug: 'bricolage-outils' },
    { name: 'Auto & Moto', slug: 'auto-moto' },
    { name: 'Sports & Plein Air', slug: 'sports-plein-air' },
    { name: 'Jouets & Jeux', slug: 'jouets-jeux' },
    { name: 'Bébé & Puériculture', slug: 'bebe-puericulture' },
    { name: 'Papeterie & Bureau', slug: 'papeterie-bureau' },
    { name: 'Animalerie', slug: 'animalerie' },
    { name: 'Épicerie & Boissons', slug: 'epicerie-boissons' },
    { name: 'Santé & Bien-être', slug: 'sante-bien-etre' },
    { name: 'Événementiel & Fêtes', slug: 'evenementiel-fetes' },
    { name: 'Instruments de Musique', slug: 'instruments-musique' },
  ];

  // Tri alphabétique (locale française : Éclairage se classe avec E, pas à part)
  // avant d'assigner sortOrder, pour un affichage de sidebar rangé A→Z.
  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  for (const [index, cat] of sortedCategories.entries()) {
    const data = { ...cat, sortOrder: index };
    await prisma.category.upsert({
      where: { slug: cat.slug },
      create: data,
      // update: data (pas juste {}) pour que renommer/réordonner une
      // catégorie ici se répercute bien sur la base existante au prochain
      // `prisma:seed`.
      update: data,
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
      storeName: 'Ridia Shop',
      storeSlug: 'ridia-shop',
      storeDescription: 'Mode et essentiels du quotidien.',
      status: SellerStatus.APPROVED,
      commissionRate: 15,
      approvedAt: new Date(),
    },
    update: {
      storeName: 'Ridia Shop',
      storeDescription: 'Mode et essentiels du quotidien.',
      status: SellerStatus.APPROVED,
    },
  });

  // Comptes de démo pour les deux nouveaux rôles restreints - évite de devoir
  // générer et activer un vrai code d'invitation juste pour tester l'accès.
  // Mêmes identifiants "Demo123!" que le vendeur de démo, faciles à retenir.
  const marketingPassword = await bcrypt.hash('MarketingDemo123!', 12);
  await prisma.user.upsert({
    where: { email: 'marketing-demo@ridia-store.com' },
    create: {
      email: 'marketing-demo@ridia-store.com',
      passwordHash: marketingPassword,
      firstName: 'Agent',
      lastName: 'Marketing',
      role: UserRole.MARKETING_AGENT,
      emailVerified: true,
    },
    update: {},
  });

  const salesAgentPassword = await bcrypt.hash('AgentDemo123!', 12);
  const salesAgentUser = await prisma.user.upsert({
    where: { email: 'agent-commercial-demo@ridia-store.com' },
    create: {
      email: 'agent-commercial-demo@ridia-store.com',
      passwordHash: salesAgentPassword,
      firstName: 'Agent',
      lastName: 'Commercial',
      role: UserRole.SALES_AGENT,
      emailVerified: true,
    },
    update: {},
  });
  // Profil SalesAgent avec un code de tracking fixe et lisible pour les tests
  // manuels (contrairement au code aléatoire généré normalement à l'activation
  // d'un vrai code d'invitation) - contrat de démo : 5% dès 500 000 FCFA/mois.
  await prisma.salesAgent.upsert({
    where: { userId: salesAgentUser.id },
    create: {
      userId: salesAgentUser.id,
      code: 'AGENT-DEMO01',
      commissionPercent: 5,
      monthlyThresholdXof: 500_000,
      status: SalesAgentStatus.ACTIVE,
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
    isFeatured?: boolean;
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
      isFeatured: true,
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
      isFeatured: true,
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
      isFeatured: true,
      priceXof: 19900,
      images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
    },
    {
      name: 'Ensemble casseroles inox 5 pièces',
      categorySlug: 'maison-cuisine',
      isFeatured: true,
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
      isFeatured: true,
      priceXof: 8900,
      images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800'],
    },

    {
      name: 'Robe Longue Fluide Manches Longues',
      categorySlug: 'mode-femme',
      priceXof: 8900,
      images: ['https://loremflickr.com/800/800/dress?lock=200'],
    },
    {
      name: 'Jupe Plissée Taille Haute',
      categorySlug: 'mode-femme',
      priceXof: 6500,
      images: ['https://loremflickr.com/800/800/skirt?lock=201'],
    },
    {
      name: 'Blazer Femme Coupe Cintrée',
      categorySlug: 'mode-femme',
      priceXof: 13900,
      images: ['https://loremflickr.com/800/800/blazer?lock=202'],
    },
    {
      name: 'Combinaison Pantalon Élégante',
      categorySlug: 'mode-femme',
      priceXof: 15900,
      images: ['https://loremflickr.com/800/800/jumpsuit?lock=203'],
    },
    {
      name: 'Legging Sport Taille Haute',
      categorySlug: 'mode-femme',
      priceXof: 4900,
      images: ['https://loremflickr.com/800/800/leggings?lock=204'],
    },
    {
      name: 'Top Croisé Manches Ballon',
      categorySlug: 'mode-femme',
      priceXof: 5900,
      images: ['https://loremflickr.com/800/800/blouse?lock=205'],
    },
    {
      name: 'Trench Coat Femme Automne',
      categorySlug: 'mode-femme',
      isFeatured: true,
      priceXof: 22900,
      images: ['https://loremflickr.com/800/800/trenchcoat?lock=206'],
    },
    {
      name: 'Robe de Soirée Sequins',
      categorySlug: 'mode-femme',
      isFeatured: true,
      priceXof: 24900,
      images: ['https://loremflickr.com/800/800/eveningdress?lock=207'],
    },
    {
      name: 'Jean Skinny Taille Haute',
      categorySlug: 'mode-femme',
      priceXof: 9900,
      images: ['https://loremflickr.com/800/800/jeans?lock=208'],
    },
    {
      name: 'Cardigan Long Maille Douce',
      categorySlug: 'mode-femme',
      priceXof: 8500,
      images: ['https://loremflickr.com/800/800/cardigan?lock=209'],
    },
    {
      name: 'Body Dentelle Manches Longues',
      categorySlug: 'mode-femme',
      priceXof: 6900,
      images: ['https://loremflickr.com/800/800/lace?lock=210'],
    },
    {
      name: 'Polo Homme Coton Piqué',
      categorySlug: 'mode-homme',
      priceXof: 6900,
      images: ['https://loremflickr.com/800/800/polo?lock=220'],
    },
    {
      name: 'Veste Bomber Homme',
      categorySlug: 'mode-homme',
      priceXof: 15900,
      images: ['https://loremflickr.com/800/800/bomberjacket?lock=221'],
    },
    {
      name: 'Jean Slim Homme Stretch',
      categorySlug: 'mode-homme',
      priceXof: 10900,
      images: ['https://loremflickr.com/800/800/menjeans?lock=222'],
    },
    {
      name: 'Pull Col Rond Homme',
      categorySlug: 'mode-homme',
      priceXof: 8900,
      images: ['https://loremflickr.com/800/800/sweater?lock=223'],
    },
    {
      name: 'Short Bermuda Homme',
      categorySlug: 'mode-homme',
      priceXof: 5900,
      images: ['https://loremflickr.com/800/800/shorts?lock=224'],
    },
    {
      name: 'Ensemble Jogging Homme 2 Pièces',
      categorySlug: 'mode-homme',
      priceXof: 11900,
      images: ['https://loremflickr.com/800/800/tracksuit?lock=225'],
    },
    {
      name: 'Blouson Cuir Synthétique Homme',
      categorySlug: 'mode-homme',
      priceXof: 24900,
      images: ['https://loremflickr.com/800/800/leatherjacket?lock=226'],
    },
    {
      name: 'Chemise à Carreaux Manches Longues',
      categorySlug: 'mode-homme',
      priceXof: 7900,
      images: ['https://loremflickr.com/800/800/plaidshirt?lock=227'],
    },
    {
      name: 'Pantalon Chino Homme Coupe Droite',
      categorySlug: 'mode-homme',
      priceXof: 9900,
      images: ['https://loremflickr.com/800/800/chinos?lock=228'],
    },
    {
      name: 'Mocassins Homme Cuir',
      categorySlug: 'chaussures',
      priceXof: 14900,
      images: ['https://loremflickr.com/800/800/loafers?lock=240'],
    },
    {
      name: 'Bottines Femme Talon Bloc',
      categorySlug: 'chaussures',
      priceXof: 16900,
      images: ['https://loremflickr.com/800/800/ankleboots?lock=241'],
    },
    {
      name: 'Sneakers Running Respirantes',
      categorySlug: 'chaussures',
      isFeatured: true,
      priceXof: 13900,
      images: ['https://loremflickr.com/800/800/sneakers?lock=242'],
    },
    {
      name: 'Escarpins Femme Talon Fin',
      categorySlug: 'chaussures',
      priceXof: 12900,
      images: ['https://loremflickr.com/800/800/heels?lock=243'],
    },
    {
      name: 'Sandales Homme Été',
      categorySlug: 'chaussures',
      priceXof: 6900,
      images: ['https://loremflickr.com/800/800/mensandals?lock=244'],
    },
    {
      name: 'Bottes Femme Hauteur Genou',
      categorySlug: 'chaussures',
      priceXof: 21900,
      images: ['https://loremflickr.com/800/800/knee-boots?lock=245'],
    },
    {
      name: 'Chaussures de Ville Homme Cuir',
      categorySlug: 'chaussures',
      priceXof: 18900,
      images: ['https://loremflickr.com/800/800/dressshoes?lock=246'],
    },
    {
      name: 'Tongs Confort Semelle Souple',
      categorySlug: 'chaussures',
      priceXof: 3900,
      images: ['https://loremflickr.com/800/800/flipflops?lock=247'],
    },
    {
      name: 'Enceinte Bluetooth Portable Étanche',
      categorySlug: 'electronique',
      priceXof: 12900,
      images: ['https://loremflickr.com/800/800/speaker?lock=260'],
    },
    {
      name: 'Powerbank 10000mAh Charge Rapide',
      categorySlug: 'electronique',
      priceXof: 8900,
      images: ['https://loremflickr.com/800/800/powerbank?lock=261'],
    },
    {
      name: 'Casque Audio Sans Fil Réduction de Bruit',
      categorySlug: 'electronique',
      isFeatured: true,
      priceXof: 22900,
      images: ['https://loremflickr.com/800/800/headphones?lock=262'],
    },
    {
      name: 'Support Téléphone Voiture Magnétique',
      categorySlug: 'electronique',
      priceXof: 3500,
      images: ['https://loremflickr.com/800/800/phoneholder?lock=263'],
    },
    {
      name: 'Clavier Bluetooth Compact',
      categorySlug: 'electronique',
      priceXof: 9900,
      images: ['https://loremflickr.com/800/800/keyboard?lock=264'],
    },
    {
      name: 'Souris Sans Fil Ergonomique',
      categorySlug: 'electronique',
      priceXof: 5900,
      images: ['https://loremflickr.com/800/800/mouse?lock=265'],
    },
    {
      name: 'Lampe LED Rechargeable USB',
      categorySlug: 'electronique',
      priceXof: 4900,
      images: ['https://loremflickr.com/800/800/led-lamp?lock=266'],
    },
    {
      name: 'Câble USB-C Charge Rapide 1m',
      categorySlug: 'electronique',
      priceXof: 2500,
      images: ['https://loremflickr.com/800/800/usbcable?lock=267'],
    },
    {
      name: 'Mini Ventilateur USB Portable',
      categorySlug: 'electronique',
      priceXof: 4500,
      images: ['https://loremflickr.com/800/800/minifan?lock=268'],
    },
    {
      name: 'Caméra de Surveillance WiFi Intérieure',
      categorySlug: 'electronique',
      priceXof: 19900,
      images: ['https://loremflickr.com/800/800/securitycamera?lock=269'],
    },
    {
      name: 'Mixeur Plongeant Multifonction',
      categorySlug: 'maison-cuisine',
      priceXof: 14900,
      images: ['https://loremflickr.com/800/800/blender?lock=280'],
    },
    {
      name: 'Bouilloire Électrique Inox 1.7L',
      categorySlug: 'maison-cuisine',
      priceXof: 9900,
      images: ['https://loremflickr.com/800/800/kettle?lock=281'],
    },
    {
      name: 'Organisateur de Placard 6 Compartiments',
      categorySlug: 'maison-cuisine',
      priceXof: 6900,
      images: ['https://loremflickr.com/800/800/closetorganizer?lock=282'],
    },
    {
      name: 'Rideaux Occultants Salon (Lot de 2)',
      categorySlug: 'maison-cuisine',
      priceXof: 11900,
      images: ['https://loremflickr.com/800/800/curtains?lock=283'],
    },
    {
      name: 'Tapis de Salon Moderne 160x230',
      categorySlug: 'maison-cuisine',
      priceXof: 24900,
      images: ['https://loremflickr.com/800/800/rug?lock=284'],
    },
    {
      name: 'Set de Couteaux de Cuisine 6 Pièces',
      categorySlug: 'maison-cuisine',
      priceXof: 12900,
      images: ['https://loremflickr.com/800/800/kitchenknives?lock=285'],
    },
    {
      name: 'Grille-Pain 2 Fentes Inox',
      categorySlug: 'maison-cuisine',
      priceXof: 10900,
      images: ['https://loremflickr.com/800/800/toaster?lock=286'],
    },
    {
      name: 'Coussins Décoratifs Salon (Lot de 4)',
      categorySlug: 'maison-cuisine',
      priceXof: 7900,
      images: ['https://loremflickr.com/800/800/throwpillow?lock=287'],
    },
    {
      name: 'Range-Chaussures Empilable 5 Niveaux',
      categorySlug: 'maison-cuisine',
      priceXof: 8500,
      images: ['https://loremflickr.com/800/800/shoerack?lock=288'],
    },
    {
      name: 'Sérum Vitamine C Éclat du Teint',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 7900,
      images: ['https://loremflickr.com/800/800/serum?lock=300'],
    },
    {
      name: 'Crème Hydratante Visage Jour & Nuit',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 6500,
      images: ['https://loremflickr.com/800/800/facecream?lock=301'],
    },
    {
      name: 'Kit Pinceaux Maquillage Professionnel',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 8900,
      images: ['https://loremflickr.com/800/800/makeupbrushes?lock=302'],
    },
    {
      name: 'Parfum Femme Eau de Toilette 50ml',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 15900,
      images: ['https://loremflickr.com/800/800/perfume?lock=303'],
    },
    {
      name: 'Rouge à Lèvres Longue Tenue (Lot de 3)',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 5900,
      images: ['https://loremflickr.com/800/800/lipstick?lock=304'],
    },
    {
      name: 'Huile Capillaire Nourrissante',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 4900,
      images: ['https://loremflickr.com/800/800/hairoil?lock=305'],
    },
    {
      name: 'Masque Visage à l\'Argile Purifiant',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 3900,
      images: ['https://loremflickr.com/800/800/facemask?lock=306'],
    },
    {
      name: 'Vernis à Ongles Gel Semi-Permanent',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 4500,
      images: ['https://loremflickr.com/800/800/nailpolish?lock=307'],
    },
    {
      name: 'Fer à Lisser Cheveux Céramique',
      categorySlug: 'beaute-cosmetiques',
      priceXof: 12900,
      images: ['https://loremflickr.com/800/800/hairstraightener?lock=308'],
    },
    {
      name: 'Ensemble Bazin Riche Brodé Femme',
      categorySlug: 'tissus-wax-boubous',
      isFeatured: true,
      priceXof: 29900,
      images: ['https://loremflickr.com/800/800/embroidereddress?lock=320'],
    },
    {
      name: 'Boubou Femme Grand Boubou Brodé',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 19900,
      images: ['https://loremflickr.com/800/800/africandress?lock=321'],
    },
    {
      name: 'Tissu Wax Premium 6 Yards Motif Exclusif',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 11900,
      images: ['https://loremflickr.com/800/800/africanfabric?lock=322'],
    },
    {
      name: 'Robe Ankara Bustier Élégante',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 13900,
      images: ['https://loremflickr.com/800/800/ankaradress?lock=323'],
    },
    {
      name: 'Chemise Homme Tissu Wax Manches Courtes',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 9900,
      images: ['https://loremflickr.com/800/800/africanshirt?lock=324'],
    },
    {
      name: 'Turban Wax Assorti',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 3500,
      images: ['https://loremflickr.com/800/800/headwrap?lock=325'],
    },
    {
      name: 'Ensemble Enfant Wax 2 Pièces',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 8900,
      images: ['https://loremflickr.com/800/800/kidsoutfit?lock=326'],
    },
    {
      name: 'Foulard Wax Grand Format',
      categorySlug: 'tissus-wax-boubous',
      priceXof: 4900,
      images: ['https://loremflickr.com/800/800/scarf?lock=327'],
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
        description: `${p.name} - disponible en stock, livraison rapide où que vous soyez.`,
        basePriceXof: p.priceXof,
        marginPercent: 80,
        stockQuantity: 50,
        status: ProductStatus.ACTIVE,
        tags: p.tags ?? [],
        isFeatured: p.isFeatured ?? false,
        publishedAt: new Date(),
      },
      // Seul isFeatured se resynchronise au reseed (pas prix/stock/description,
      // qui peuvent avoir été ajustés depuis l'admin entre deux seeds).
      update: { isFeatured: p.isFeatured ?? false },
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
  console.log(`   Agent Marketing: marketing-demo@ridia-store.com / MarketingDemo123!`);
  console.log(`   Agent Commercial: agent-commercial-demo@ridia-store.com / AgentDemo123! (code: AGENT-DEMO01)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
