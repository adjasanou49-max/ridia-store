'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'ridia_install_prompt_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Bannière discrète proposant d'installer Ridia Store comme application
 * (raccourci écran d'accueil, plein écran, sans barre d'adresse).
 * - Android/Chrome/Edge : capte l'évènement natif `beforeinstallprompt`.
 * - iOS/Safari : ne supporte pas cet évènement, on affiche une consigne
 *   manuelle ("Partager > Sur l'écran d'accueil") à la place.
 * - Ne s'affiche pas si l'app tourne déjà en mode installé (standalone),
 *   ni si l'utilisateur l'a déjà fermée.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // showIosInstructions et visible étaient deux setState séparés déclenchés
  // ensemble dans le même effet (rendu en cascade signalé par le linter) -
  // regroupés en un seul état pour n'entraîner qu'un seul rendu.
  const [display, setDisplay] = useState<{ visible: boolean; showIosInstructions: boolean }>({
    visible: false,
    showIosInstructions: false,
  });

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    if (isStandalone || dismissed) return;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    if (isIos) {
      // Lecture navigateur au montage uniquement (deps vides, jamais répété -
      // pas de rendu en cascade réel), nécessaire ici pour éviter une
      // incohérence d'hydratation SSR (window indisponible pendant le rendu serveur).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay({ visible: true, showIosInstructions: true });
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDisplay({ visible: true, showIosInstructions: false });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDisplay((d) => ({ ...d, visible: false }));
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setDisplay((d) => ({ ...d, visible: false }));
  };

  if (!display.visible) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-3 right-3 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-lg md:left-auto md:right-4 md:max-w-sm">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500">
        <Download className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 text-sm">
        <p className="font-semibold">Installer Ridia Store</p>
        {display.showIosInstructions ? (
          <p className="text-xs text-gray-300">
            Appuie sur Partager, puis « Sur l&apos;écran d&apos;accueil ».
          </p>
        ) : (
          <p className="text-xs text-gray-300">Accès rapide, plein écran, sans navigateur.</p>
        )}
      </div>
      {!display.showIosInstructions && (
        <button
          onClick={handleInstall}
          className="flex-shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold hover:bg-brand-600"
        >
          Installer
        </button>
      )}
      <button onClick={dismiss} aria-label="Fermer" className="flex-shrink-0 text-gray-400 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
