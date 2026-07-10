import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6 text-sm text-gray-500">
        <div>
          <p className="font-bold text-brand-600 mb-2">Ridia Store</p>
          <p>Mode africaine et import direct de Chine.</p>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-2">Informations légales</p>
          <ul className="space-y-1">
            <li><Link href="/cgv" className="hover:text-brand-600">Conditions générales de vente</Link></li>
            <li><Link href="/regles-utilisation" className="hover:text-brand-600">Règles d&apos;utilisation</Link></li>
            <li><Link href="/confidentialite" className="hover:text-brand-600">Politique de confidentialité</Link></li>
            <li><Link href="/retours" className="hover:text-brand-600">Politique de retours</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-2">Aide</p>
          <ul className="space-y-1">
            <li><Link href="/orders" className="hover:text-brand-600">Suivre ma commande</Link></li>
            <li><Link href="/account/settings" className="hover:text-brand-600">Mon compte</Link></li>
          </ul>
        </div>
      </div>
      <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
        © {new Date().getFullYear()} Ridia Store. Tous droits réservés.
      </div>
    </footer>
  );
}
