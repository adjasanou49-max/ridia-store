import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridia-store.com';

interface ProductForMetadata {
  slug: string;
  name: string;
  description: string;
  sku: string;
  brand?: string | null;
  basePriceXof: number;
  stockQuantity: number;
  rating: number;
  reviewCount: number;
  images: { url: string; isPrimary: boolean }[];
}

// Appelé côté serveur au moment du rendu de la page (et lors de la génération
// du sitemap/des partages) - jamais exécuté dans le navigateur. Si l'appel
// échoue (produit supprimé, API indisponible), on retombe sur un titre
// générique plutôt que de faire planter la page.
async function fetchProductForMetadata(slug: string): Promise<ProductForMetadata | null> {
  try {
    const res = await fetch(`${API_URL}/products/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductForMetadata(slug);

  if (!product) {
    return { title: 'Produit - Ridia Store' };
  }

  // Description tronquée proprement (les moteurs de recherche et WhatsApp
  // coupent brutalement au-delà d'une certaine longueur sinon).
  const cleanDescription = product.description.replace(/\s+/g, ' ').trim().slice(0, 155);
  const primaryImage = product.images.find((i) => i.isPrimary)?.url ?? product.images[0]?.url;
  const title = `${product.name} - Ridia Store`;

  return {
    title,
    description: cleanDescription,
    alternates: { canonical: `${SITE_URL}/products/${slug}` },
    openGraph: {
      title,
      description: cleanDescription,
      url: `${SITE_URL}/products/${slug}`,
      siteName: 'Ridia Store',
      images: primaryImage ? [{ url: primaryImage, width: 800, height: 800, alt: product.name }] : undefined,
      type: 'website',
      locale: 'fr_FR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: cleanDescription,
      images: primaryImage ? [primaryImage] : undefined,
    },
  };
}

// Données structurées schema.org/Product - permet à Google d'afficher
// prix/disponibilité/note directement dans les résultats de recherche
// (rich snippets), au lieu d'un lien texte nu.
function buildProductJsonLd(product: ProductForMetadata) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description.replace(/\s+/g, ' ').trim().slice(0, 500),
    sku: product.sku,
    image: product.images.map((i) => i.url),
    brand: { '@type': 'Brand', name: product.brand || 'Ridia Store' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.slug}`,
      priceCurrency: 'XOF',
      price: product.basePriceXof,
      availability: product.stockQuantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
    // Google ignore aggregateRating sans avis réels - on ne l'ajoute que s'il
    // y en a au moins un, pour ne jamais afficher une fausse note de 0.
    ...(product.reviewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating,
        reviewCount: product.reviewCount,
      },
    }),
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProductForMetadata(slug);

  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          // JSON.stringify échappe déjà les guillemets/caractères spéciaux JSON,
          // mais pas une séquence "</script>" littérale qui casserait la balise -
          // la description vient du vendeur, donc pas mise à l'abri par défaut.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildProductJsonLd(product)).replace(/</g, '\\u003c'),
          }}
        />
      )}
      <ProductDetailClient />
    </>
  );
}
