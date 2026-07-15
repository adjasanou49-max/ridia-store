'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/language';

export function Footer() {
  const { t } = useLanguage();

  const links = [
    { href: '/cgv', label: t('footer.cgv') },
    { href: '/regles-utilisation', label: t('footer.terms') },
    { href: '/confidentialite', label: t('footer.privacy') },
    { href: '/retours', label: t('footer.returns') },
    { href: '/orders', label: t('footer.trackOrder') },
    { href: '/account/settings', label: t('footer.myAccount') },
  ];

  return (
    <footer className="mt-8 px-4 pb-4">
      <div className="max-w-7xl mx-auto rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500">
        <p className="mb-1 font-bold text-brand-600">Ridia Store</p>
        <p className="mb-4">{t('footer.tagline')}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 pt-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand-600">
              {link.label}
            </Link>
          ))}
        </div>

        <p className="mt-4 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Ridia Store. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
