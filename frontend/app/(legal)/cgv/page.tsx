export default function CGVPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 prose prose-sm">
      <h1 className="text-2xl font-bold mb-6">Conditions Générales de Vente</h1>

      <h2 className="font-semibold mt-6 mb-2">0. Identification de l&apos;entreprise</h2>
      <p className="text-gray-600">
        Ridia Store est exploité par ARDJATA SANOU, entreprise individuelle immatriculée au
        Burkina Faso.
      </p>
      <ul className="text-gray-600">
        <li>Régime fiscal : Contribution des Micro-Entreprises (CME)</li>
        <li>Identifiant Financier Unique (IFU) : 00207954S</li>
        <li>RCCM : BFBD2002A756</li>
        <li>Adresse : 109 Rue 15.46, Secteur 15, Bobo-Dioulasso, Burkina Faso</li>
      </ul>

      <h2 className="font-semibold mt-6 mb-2">1. Objet</h2>
      <p className="text-gray-600">
        Les présentes conditions régissent les ventes réalisées sur Ridia Store entre le client
        et les vendeurs référencés sur la plateforme.
      </p>

      <h2 className="font-semibold mt-6 mb-2">2. Prix</h2>
      <p className="text-gray-600">
        Les prix sont indiqués en Francs CFA (XOF), toutes taxes comprises. Ridia Store se réserve
        le droit de modifier ses prix à tout moment, les produits étant facturés sur la base du
        tarif en vigueur au moment de la validation de la commande.
      </p>

      <h2 className="font-semibold mt-6 mb-2">3. Commande</h2>
      <p className="text-gray-600">
        Toute commande passée sur le site implique l&apos;acceptation pleine et entière des
        présentes conditions générales de vente.
      </p>

      <h2 className="font-semibold mt-6 mb-2">4. Paiement</h2>
      <p className="text-gray-600">
        Le paiement s&apos;effectue via les moyens proposés sur le site (Wave, Orange
        Money, MTN Mobile Money). La commande n&apos;est confirmée qu&apos;après validation du paiement.
      </p>

      <h2 className="font-semibold mt-6 mb-2">5. Livraison</h2>
      <p className="text-gray-600">
        Les délais de livraison sont communiqués à titre indicatif lors de la commande et peuvent
        varier selon la disponibilité du produit et la destination.
      </p>

      <h2 className="font-semibold mt-6 mb-2">6. Rétractation & retours</h2>
      <p className="text-gray-600">
        Voir notre <a href="/retours" className="text-brand-600">politique de retours</a> pour les
        modalités applicables.
      </p>

      <p className="text-xs text-gray-400 mt-8">Dernière mise à jour : Juillet 2026</p>
    </div>
  );
}
