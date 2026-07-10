import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridia-store.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/seller', '/account', '/checkout', '/cart'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
