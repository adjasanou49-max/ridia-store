export default function ConfidentialitePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 prose prose-sm">
      <h1 className="text-2xl font-bold mb-6">Politique de confidentialité</h1>

      <h2 className="font-semibold mt-6 mb-2">1. Données collectées</h2>
      <p className="text-gray-600">
        Nous collectons les informations nécessaires à la gestion de votre compte et de vos
        commandes : nom, email, téléphone, adresses de livraison, historique de commandes.
      </p>

      <h2 className="font-semibold mt-6 mb-2">2. Utilisation des données</h2>
      <p className="text-gray-600">
        Vos données servent à traiter vos commandes, vous envoyer des notifications (email,
        WhatsApp) et, si vous y consentez, vous informer de nos offres.
      </p>

      <h2 className="font-semibold mt-6 mb-2">3. Partage des données</h2>
      <p className="text-gray-600">
        Vos données ne sont jamais vendues. Elles sont partagées uniquement avec nos prestataires
        techniques nécessaires (paiement, livraison, hébergement) dans la stricte mesure requise
        pour honorer votre commande.
      </p>

      <h2 className="font-semibold mt-6 mb-2">4. Vos droits</h2>
      <p className="text-gray-600">
        Tu peux à tout moment consulter, exporter ou supprimer tes données personnelles depuis
        la page <a href="/account/settings" className="text-brand-600">Paramètres du compte</a>,
        section &quot;Mes données&quot;.
      </p>

      <h2 className="font-semibold mt-6 mb-2">5. Cookies</h2>
      <p className="text-gray-600">
        Ridia Store utilise des cookies techniques essentiels au fonctionnement du site
        (connexion, panier). Aucun cookie publicitaire tiers n&apos;est utilisé.
      </p>

      <p className="text-xs text-gray-400 mt-8">Dernière mise à jour : Juillet 2026</p>
    </div>
  );
}
