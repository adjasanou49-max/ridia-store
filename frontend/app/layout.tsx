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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ridia-store.com'),
  title: 'Ridia Store - Marketplace en ligne',
  description:
    'Marketplace e-commerce : mode, tissus wax, boubous, électronique et essentiels du quotidien, livrés partout dans le monde.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#f97316',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <QueryProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <CurrencyProvider>
                  <Navbar />
                  <main className="min-h-screen pb-16 md:pb-0">{children}</main>
                  <Footer />
                  <MobileBottomNav />
                  <InstallPrompt />
                </CurrencyProvider>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
