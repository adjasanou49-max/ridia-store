'use client';

import { useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';

const CONSENT_COOKIE = 'ridia_cookie_consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => !Cookies.get(CONSENT_COOKIE));

  function accept() {
    Cookies.set(CONSENT_COOKIE, 'acknowledged', { expires: 365, path: '/' });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center gap-3 text-sm">
        <p className="text-gray-600 flex-1">
          Ridia Store utilise uniquement des cookies techniques essentiels (connexion, panier) —
          aucun cookie publicitaire tiers. En savoir plus dans notre{' '}
          <Link href="/confidentialite" className="text-brand-600 underline">
            politique de confidentialité
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="bg-brand-500 hover:bg-brand-600 text-white font-medium px-4 py-2 rounded-lg text-sm shrink-0"
        >
          J&apos;ai compris
        </button>
      </div>
    </div>
  );
}
