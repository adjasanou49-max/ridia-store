'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';

export const LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
};

export const AVAILABLE_LANGUAGES = Object.keys(LANGUAGE_LABELS);

/**
 * Dictionnaire de traduction de l'interface (chrome de l'app : navigation,
 * recherche, pied de page, actions communes). Ne couvre pas encore le
 * contenu des produits (noms/descriptions saisis par les vendeurs) - ça,
 * c'est un projet à part qui passera par LibreTranslate à la demande.
 *
 * Pour ajouter une langue : dupliquer le bloc "fr", traduire chaque valeur,
 * ajouter l'entrée dans LANGUAGE_LABELS ci-dessus.
 */
const DICTIONARY = {
  fr: {
    'nav.home': 'Accueil',
    'nav.categories': 'Catégories',
    'nav.support': 'Support',
    'nav.cart': 'Panier',
    'nav.orders': 'Commandes',
    'nav.account': 'Compte',
    'nav.products': 'Produits',
    'nav.wishlist': 'Favoris',
    'nav.settings': 'Paramètres',
    'nav.logout': 'Se déconnecter',
    'nav.login': 'Se connecter',
    'nav.currency': "Devise d'affichage",
    'nav.language': "Langue de l'app",
    'search.placeholder': 'Rechercher un produit...',
    'search.imageSearch': 'Recherche par photo',
    'common.addToCart': 'Ajouter au panier',
    'common.buyNow': 'Acheter maintenant',
    'common.viewAll': 'Voir tout',
    'common.outOfStock': 'Rupture de stock',
    'common.install': 'Installer',
    'common.installApp': 'Installer Ridia Store',
    'common.loading': 'Chargement...',
    'common.seeMore': 'Voir plus',
    'home.cheapPrices': 'Petits prix',
    'home.flashSale': 'Ventes flash',
    'home.recommended': 'Recommandé pour toi',
    'cart.title': 'Panier',
    'cart.empty': 'Votre panier est vide.',
    'cart.subtotal': 'Sous-total',
    'cart.checkout': 'Passer la commande',
    'footer.tagline': 'Mode, tissus wax, boubous et essentiels du quotidien, livrés partout dans le monde.',
    'footer.legal': 'Informations légales',
    'footer.cgv': 'Conditions générales de vente',
    'footer.terms': "Règles d'utilisation",
    'footer.privacy': 'Politique de confidentialité',
    'footer.returns': 'Politique de retours',
    'footer.help': 'Aide',
    'footer.trackOrder': 'Suivre ma commande',
    'footer.myAccount': 'Mon compte',
    'footer.rights': 'Tous droits réservés.',
  },
  en: {
    'nav.home': 'Home',
    'nav.categories': 'Categories',
    'nav.support': 'Support',
    'nav.cart': 'Cart',
    'nav.orders': 'Orders',
    'nav.account': 'Account',
    'nav.products': 'Products',
    'nav.wishlist': 'Wishlist',
    'nav.settings': 'Settings',
    'nav.logout': 'Log out',
    'nav.login': 'Log in',
    'nav.currency': 'Display currency',
    'nav.language': 'App language',
    'search.placeholder': 'Search for a product...',
    'search.imageSearch': 'Search by photo',
    'common.addToCart': 'Add to cart',
    'common.buyNow': 'Buy now',
    'common.viewAll': 'View all',
    'common.outOfStock': 'Out of stock',
    'common.install': 'Install',
    'common.installApp': 'Install Ridia Store',
    'common.loading': 'Loading...',
    'common.seeMore': 'See more',
    'home.cheapPrices': 'Great deals',
    'home.flashSale': 'Flash sales',
    'home.recommended': 'Recommended for you',
    'cart.title': 'Cart',
    'cart.empty': 'Your cart is empty.',
    'cart.subtotal': 'Subtotal',
    'cart.checkout': 'Checkout',
    'footer.tagline': 'Fashion, wax fabrics, boubous and everyday essentials, delivered worldwide.',
    'footer.legal': 'Legal information',
    'footer.cgv': 'Terms of sale',
    'footer.terms': 'Terms of use',
    'footer.privacy': 'Privacy policy',
    'footer.returns': 'Return policy',
    'footer.help': 'Help',
    'footer.trackOrder': 'Track my order',
    'footer.myAccount': 'My account',
    'footer.rights': 'All rights reserved.',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.categories': 'Categorías',
    'nav.support': 'Soporte',
    'nav.cart': 'Carrito',
    'nav.orders': 'Pedidos',
    'nav.account': 'Cuenta',
    'nav.products': 'Productos',
    'nav.wishlist': 'Favoritos',
    'nav.settings': 'Ajustes',
    'nav.logout': 'Cerrar sesión',
    'nav.login': 'Iniciar sesión',
    'nav.currency': 'Moneda de visualización',
    'nav.language': 'Idioma de la app',
    'search.placeholder': 'Buscar un producto...',
    'search.imageSearch': 'Buscar por foto',
    'common.addToCart': 'Añadir al carrito',
    'common.buyNow': 'Comprar ahora',
    'common.viewAll': 'Ver todo',
    'common.outOfStock': 'Agotado',
    'common.install': 'Instalar',
    'common.installApp': 'Instalar Ridia Store',
    'common.loading': 'Cargando...',
    'common.seeMore': 'Ver más',
    'home.cheapPrices': 'Precios bajos',
    'home.flashSale': 'Ventas flash',
    'home.recommended': 'Recomendado para ti',
    'cart.title': 'Carrito',
    'cart.empty': 'Tu carrito está vacío.',
    'cart.subtotal': 'Subtotal',
    'cart.checkout': 'Finalizar compra',
    'footer.tagline': 'Moda, telas wax, boubous y artículos esenciales, entregados en todo el mundo.',
    'footer.legal': 'Información legal',
    'footer.cgv': 'Condiciones de venta',
    'footer.terms': 'Condiciones de uso',
    'footer.privacy': 'Política de privacidad',
    'footer.returns': 'Política de devoluciones',
    'footer.help': 'Ayuda',
    'footer.trackOrder': 'Rastrear mi pedido',
    'footer.myAccount': 'Mi cuenta',
    'footer.rights': 'Todos los derechos reservados.',
  },
  pt: {
    'nav.home': 'Início',
    'nav.categories': 'Categorias',
    'nav.support': 'Suporte',
    'nav.cart': 'Carrinho',
    'nav.orders': 'Pedidos',
    'nav.account': 'Conta',
    'nav.products': 'Produtos',
    'nav.wishlist': 'Favoritos',
    'nav.settings': 'Configurações',
    'nav.logout': 'Sair',
    'nav.login': 'Entrar',
    'nav.currency': 'Moeda de exibição',
    'nav.language': 'Idioma do app',
    'search.placeholder': 'Buscar um produto...',
    'search.imageSearch': 'Buscar por foto',
    'common.addToCart': 'Adicionar ao carrinho',
    'common.buyNow': 'Comprar agora',
    'common.viewAll': 'Ver tudo',
    'common.outOfStock': 'Sem estoque',
    'common.install': 'Instalar',
    'common.installApp': 'Instalar Ridia Store',
    'common.loading': 'Carregando...',
    'common.seeMore': 'Ver mais',
    'home.cheapPrices': 'Preços baixos',
    'home.flashSale': 'Vendas relâmpago',
    'home.recommended': 'Recomendado para você',
    'cart.title': 'Carrinho',
    'cart.empty': 'Seu carrinho está vazio.',
    'cart.subtotal': 'Subtotal',
    'cart.checkout': 'Finalizar pedido',
    'footer.tagline': 'Moda, tecidos wax, boubous e itens essenciais, entregues no mundo todo.',
    'footer.legal': 'Informações legais',
    'footer.cgv': 'Condições de venda',
    'footer.terms': 'Termos de uso',
    'footer.privacy': 'Política de privacidade',
    'footer.returns': 'Política de devoluções',
    'footer.help': 'Ajuda',
    'footer.trackOrder': 'Rastrear meu pedido',
    'footer.myAccount': 'Minha conta',
    'footer.rights': 'Todos os direitos reservados.',
  },
} as const;

export type TranslationKey = keyof (typeof DICTIONARY)['fr'];

interface LanguageContextValue {
  language: string;
  setLanguage: (code: string) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** Langue déduite du cookie côté serveur (évite un flash FR -> autre langue au chargement) */
  initialLanguage?: string;
}) {
  const [language, setLanguageState] = useState(
    () => initialLanguage || Cookies.get('ridia_language') || 'fr'
  );

  function setLanguage(code: string) {
    setLanguageState(code);
    Cookies.set('ridia_language', code, { expires: 365 });
    // Recharge pour que <html lang="..."> (rendu côté serveur) reste cohérent avec le choix.
    window.location.reload();
  }

  function t(key: TranslationKey): string {
    const dict = DICTIONARY[language as keyof typeof DICTIONARY] ?? DICTIONARY.fr;
    return dict[key] ?? DICTIONARY.fr[key] ?? key;
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage doit être utilisé dans un LanguageProvider');
  return ctx;
}
