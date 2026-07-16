import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { QueryProvider } from '@/lib/query-provider';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { InstallPrompt } from '@/components/InstallPrompt';
import { CartProvider } from '@/lib/cart';
import { WishlistProvider } from '@/lib/wishlist';
import { CurrencyProvider } from '@/lib/currency';
import { LanguageProvider } from '@/lib/language';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridia-store.com';
const DEFAULT_TITLE = 'Ridia Store - Marketplace en ligne';
const DEFAULT_DESCRIPTION =
  'Marketplace e-commerce : mode, tissus wax, boubous, électronique et essentiels du quotidien, livrés partout dans le monde.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  manifest: '/manifest.json',
  // Valeurs par défaut pour TOUTE page qui ne définit pas les siennes (les
  // fiches produit les remplacent avec leur propre image/titre via
  // generateMetadata) - sans ça, partager l'accueil ou une page catégorie
  // sur WhatsApp affichait une carte vide, sans image ni description.
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: 'Ridia Store',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'Ridia Store' }],
    type: 'website',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ['/icon-512.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#f97316',
};

// Pas de cookies()/headers() ici : ça forcerait TOUTE l'app en rendu dynamique
// (plus aucune page statique/cachée), donc une dépendance au backend à chaque
// requête. La langue reste gérée uniquement côté client (LanguageProvider),
// avec 'fr' comme lang par défaut sur <html> - acceptable, l'essentiel pour le
// SEO est que le contenu texte visible soit cohérent, pas l'attribut lang seul.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <QueryProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <CurrencyProvider>
                  <LanguageProvider>
                    <Navbar />
                    <main className="min-h-screen pb-16 md:pb-0">{children}</main>
                    <Footer />
                    <MobileBottomNav />
                    <InstallPrompt />
                  </LanguageProvider>
                </CurrencyProvider>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
