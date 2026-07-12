import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridiastore.com';

interface ProductForMetadata {
  name: string;
  description: string;
  basePriceXof: number;
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

export default function ProductDetailPage() {
  return <ProductDetailClient />;
}
