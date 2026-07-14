'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, User, Menu, X, LayoutDashboard, Store, Settings, ChevronDown, Heart, MapPin, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useCurrency } from '@/lib/currency';
import { useLanguage, LANGUAGE_LABELS, AVAILABLE_LANGUAGES } from '@/lib/language';
import { NotificationBell } from './NotificationBell';
import { SearchBar } from './SearchBar';

export function Navbar() {
  const { user, logout, isAdmin, isSeller } = useAuth();
  const { itemCount } = useCart();
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const { language, setLanguage } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 h-16">
        <Link href="/" className="text-xl font-bold text-brand-600 shrink-0">
          Ridia<span className="text-gray-900">Store</span>
        </Link>

        {/* Barre de recherche centrale avec aperçu image - élément le plus visible, comme Amazon */}
        <div className="hidden sm:block flex-1">
          <SearchBar />
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-700 shrink-0">
          <Link href="/products" className="hover:text-brand-600">
            Produits
          </Link>
          {user && (
            <Link href="/orders" className="hover:text-brand-600">
              Mes commandes
            </Link>
          )}

          {/* Visible seulement si SELLER - lien vers l'espace vendeur */}
          {isSeller && (
            <Link
              href="/seller/dashboard"
              className="flex items-center gap-1 hover:text-brand-600"
            >
              <Store size={16} /> Espace Vendeur
            </Link>
          )}

          {/* Visible seulement si ADMIN ou SUPER_ADMIN */}
          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-1 text-brand-700 font-semibold hover:text-brand-800"
            >
              <LayoutDashboard size={16} /> Administration
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            title="Langue de l'application"
            className="hidden sm:block text-xs text-gray-500 bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
          >
            {AVAILABLE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>

          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            title="Devise d'affichage - le paiement reste toujours en FCFA"
            className="hidden sm:block text-xs text-gray-500 bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
          >
            {availableCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          <NotificationBell />

          <Link href="/cart" className="relative">
            <ShoppingCart className="text-gray-700" size={22} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-brand-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="hidden md:block relative" ref={accountMenuRef}>
              <button
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-brand-600"
              >
                <span>Bonjour, {user.firstName}</span>
                <ChevronDown size={14} />
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
                  <Link
                    href="/account/settings"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Settings size={15} /> Paramètres
                  </Link>
                  <Link
                    href="/addresses"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <MapPin size={15} /> Mes adresses
                  </Link>
                  <Link
                    href="/wishlist"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Heart size={15} /> Mes favoris
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <ShoppingCart size={15} /> Mes commandes
                  </Link>
                  <Link
                    href="/account/wallet"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Wallet size={15} /> Mon Wallet
                  </Link>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden md:flex items-center gap-1 text-sm font-medium hover:text-brand-600"
            >
              <User size={18} /> Connexion
            </Link>
          )}

          <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Recherche mobile - pleine largeur avec aperçu image, sous le header (écrans < sm) */}
      <div className="sm:hidden px-4 pb-3">
        <SearchBar mobile />
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 px-4 py-3 flex flex-col gap-3 text-sm font-medium">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <span className="text-gray-500 font-normal">Langue de l&apos;app</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              title="Langue de l'application"
              className="text-sm text-gray-700 bg-transparent border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
            >
              {AVAILABLE_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <span className="text-gray-500 font-normal">Devise d&apos;affichage</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              title="Devise d'affichage - le paiement reste toujours en FCFA"
              className="text-sm text-gray-700 bg-transparent border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
            >
              {availableCurrencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <Link href="/products" onClick={() => setMenuOpen(false)}>
            Produits
          </Link>
          {user && (
            <Link href="/orders" onClick={() => setMenuOpen(false)}>
              Mes commandes
            </Link>
          )}
          {user && (
            <Link href="/account/wallet" onClick={() => setMenuOpen(false)}>
              Mon Wallet
            </Link>
          )}
          {isSeller && (
            <Link href="/seller/dashboard" onClick={() => setMenuOpen(false)}>
              Espace Vendeur
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/dashboard" className="text-brand-700 font-semibold" onClick={() => setMenuOpen(false)}>
              Administration
            </Link>
          )}
          {user && (
            <Link href="/account/settings" onClick={() => setMenuOpen(false)}>
              Paramètres
            </Link>
          )}
          {user ? (
            <button onClick={logout} className="text-left text-red-600">
              Déconnexion
            </button>
          ) : (
            <Link href="/login" onClick={() => setMenuOpen(false)}>
              Connexion
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
