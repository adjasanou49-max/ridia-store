/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.bunnycdn.com' },
      { protocol: 'https', hostname: '**.b-cdn.net' },
      { protocol: 'https', hostname: '**.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.alicdn.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'loremflickr.com' },
      { protocol: 'https', hostname: 'mock-cdn.ridia-store.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/:path*`,
      },
    ];
  },
};

// withSentryConfig ajoute l'upload des source maps à chaque build (pour avoir
// des stack traces lisibles) - silencieux si SENTRY_AUTH_TOKEN n'est pas
// configuré (aucune erreur de build dans ce cas, juste pas d'upload).
module.exports = withSentryConfig(nextConfig, {
  org: 'ridia',
  project: 'ridia-store-frontend',
  silent: true,
  widenClientFileUpload: true,
});
