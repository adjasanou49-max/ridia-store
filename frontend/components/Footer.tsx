'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/language';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6 text-sm text-gray-500">
        <div>
          <p className="font-bold text-brand-600 mb-2">Ridia Store</p>
          <p>{t('footer.tagline')}</p>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-2">{t('footer.legal')}</p>
          <ul className="space-y-1">
            <li><Link href="/cgv" className="hover:text-brand-600">{t('footer.cgv')}</Link></li>
            <li><Link href="/regles-utilisation" className="hover:text-brand-600">{t('footer.terms')}</Link></li>
            <li><Link href="/confidentialite" className="hover:text-brand-600">{t('footer.privacy')}</Link></li>
            <li><Link href="/retours" className="hover:text-brand-600">{t('footer.returns')}</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-2">{t('footer.help')}</p>
          <ul className="space-y-1">
            <li><Link href="/orders" className="hover:text-brand-600">{t('footer.trackOrder')}</Link></li>
            <li><Link href="/account/settings" className="hover:text-brand-600">{t('footer.myAccount')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
        © {new Date().getFullYear()} Ridia Store. {t('footer.rights')}
      </div>
    </footer>
  );
}
