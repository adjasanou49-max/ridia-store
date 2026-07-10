import type { MetadataRoute } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridia-store.com';

interface SlugItem {
  slug: string;
  updatedAt: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: 'daily', priority: 0.9 },
  ];

  try {
    const res = await fetch(`${API_URL}/products?pageSize=1000`, { next: { revalidate: 3600 } });
    const data = await res.json();
    const products: SlugItem[] = data.items || [];

    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...staticPages, ...productPages];
  } catch {
    return staticPages;
  }
}
