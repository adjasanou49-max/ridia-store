export default function ReglesUtilisationPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 prose prose-sm">
      <h1 className="text-2xl font-bold mb-6">Règles d&apos;utilisation</h1>
      <p className="text-gray-500 mb-6">
        Ces règles complètent nos{' '}
        <a href="/cgv" className="text-brand-600">
          Conditions Générales de Vente
        </a>{' '}
        et décrivent ce qui est attendu de chacun pour que Ridia Store reste un espace sûr et
        agréable.
      </p>

      <h2 className="font-semibold mt-6 mb-2">1. Compte utilisateur</h2>
      <p className="text-gray-600">
        Un compte est personnel et ne doit pas être partagé. Tu es responsable de la
        confidentialité de ton mot de passe. Les informations fournies (nom, téléphone, adresses)
        doivent être exactes pour permettre la livraison de tes commandes.
      </p>

      <h2 className="font-semibold mt-6 mb-2">2. Comportement attendu</h2>
      <p className="text-gray-600">
        Sont interdits : la publication d&apos;avis mensongers ou achetés, le harcèlement d&apos;un
        vendeur ou d&apos;un autre client, l&apos;utilisation de faux comptes pour contourner les
        limites (codes promo, parrainage), et toute tentative de fraude au paiement.
      </p>

      <h2 className="font-semibold mt-6 mb-2">3. Contenu publié (avis, photos)</h2>
      <p className="text-gray-600">
        Les avis et photos que tu publies doivent concerner ton expérience réelle avec le produit.
        Ridia Store se réserve le droit de retirer tout contenu injurieux, hors sujet, ou
        manifestement faux, sans préavis.
      </p>

      <h2 className="font-semibold mt-6 mb-2">4. Codes promo et parrainage</h2>
      <p className="text-gray-600">
        Les codes promo et le programme de parrainage sont réservés à un usage personnel et
        raisonnable. Toute utilisation frauduleuse (comptes multiples, auto-parrainage) entraîne
        l&apos;annulation des avantages obtenus et peut mener à la suspension du compte.
      </p>

      <h2 className="font-semibold mt-6 mb-2">5. Suspension de compte</h2>
      <p className="text-gray-600">
        Ridia Store peut suspendre ou clôturer un compte en cas de non-respect de ces règles, de
        comportement frauduleux, ou d&apos;abus envers l&apos;équipe ou les autres utilisateurs.
      </p>

      <h2 className="font-semibold mt-6 mb-2">6. Vendeurs</h2>
      <p className="text-gray-600">
        Les vendeurs s&apos;engagent à décrire fidèlement leurs produits, à respecter les délais de
        traitement annoncés, et à ne jamais tenter de contacter un client en dehors de la
        plateforme pour contourner les protections en place.
      </p>

      <p className="text-xs text-gray-400 mt-8">Dernière mise à jour : Juillet 2026</p>
    </div>
  );
}
