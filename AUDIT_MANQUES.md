# 🔍 AUDIT RIDIA STORE — Tout ce qui manque

**Date:** Juillet 2026
**Méthode:** Inspection ligne par ligne du code backend (40 fichiers) + frontend (20 routes)

---

## 🚨 BUGS CRITIQUES (corrigés pendant cet audit)

Ces 3 bugs auraient cassé l'app en production. **Déjà corrigés dans le code que tu as téléchargé** — mentionnés ici pour transparence totale.

| Bug | Impact | Statut |
|---|---|---|
| Backend montait les routes sur `/api/v1` mais **tout** le frontend appelait `/api` | 100% des requêtes auraient échoué (404) dès le déploiement | ✅ Corrigé |
| `getProductBySlug` référençait un modèle `Review` qui n'existe pas en base | Chaque clic sur une fiche produit aurait planté (erreur Prisma) | ✅ Corrigé (retiré en attendant le vrai système d'avis) |
| Le taux de change modifié dans Paramètres admin n'était jamais utilisé pour calculer les prix | L'admin croit changer le taux, mais rien ne change réellement | ✅ Corrigé (`ProductService` lit maintenant `SystemSetting`) |

---

## 🔴 PRIORITÉ HAUTE — Bloquant pour un vrai lancement

### 1. Gestion des adresses (CRUD complet manquant)
**Problème:** Il n'existe **aucune route** pour créer/lister/modifier une adresse. La page checkout demande à l'utilisateur de **taper l'ID de l'adresse à la main** — inutilisable en l'état.
**À faire:** Routes `POST/GET/PATCH/DELETE /addresses`, page "Mes adresses", sélecteur d'adresse au checkout avec formulaire "+ Nouvelle adresse".

### 2. Upload réel d'images
**Problème:** `StorageAdapter.ts` existe et sait parler à S3/Bunny, mais **aucune route n'accepte de fichier** (pas de `multer`, pas d'endpoint `/upload`). Le vendeur doit coller une URL d'image trouvée ailleurs.
**À faire:** Route `POST /upload` (multipart), branchement dans le formulaire vendeur (drag & drop ou sélecteur de fichier), redimensionnement/compression (`sharp` déjà en dépendance mais inutilisé).

### 3. Système d'avis/reviews
**Problème:** Aucun modèle `Review` en base. `rating`/`reviewCount` existent sur `Product` et `Seller` mais ne sont jamais alimentés — toujours à 0.
**À faire:** Modèle `Review` (note, commentaire, photos, lié à une commande livrée), route pour laisser un avis après livraison, UI sur la fiche produit, recalcul automatique de la moyenne.

### 4. Modification/suppression de produit (vendeur)
**Problème:** Le vendeur peut **créer** un produit et le **publier**, mais pas le modifier ni le supprimer après coup. Pas de route `PATCH /products/:id` générique ni `DELETE`.
**À faire:** Route d'édition complète, UI "Modifier" sur chaque produit dans "Mes produits".

### 5. Gestion des commandes côté vendeur/admin
**Problème:** Le backend a `GET /admin/orders` mais **aucune page frontend** ne l'utilise. Le vendeur n'a aucun moyen de voir ses commandes, marquer "expédié", ou ajouter un numéro de suivi.
**À faire:** Page `/admin/orders` (déjà backend-ready), page `/seller/orders` avec mise à jour de statut + tracking.

### 6. Annulation de commande (client)
**Problème:** Aucune route pour qu'un client annule sa propre commande avant expédition.
**À faire:** `PATCH /orders/:id/cancel` avec règles (annulable seulement si `PENDING`/`CONFIRMED`), remise en stock automatique.

---

## 🟠 PRIORITÉ MOYENNE — Attendu sur une vraie marketplace

### 7. Authentification complète
- **Mot de passe oublié** : aucune route `forgot-password`/`reset-password` (envoi email avec lien)
- **Vérification email** : le champ `emailVerified` existe mais rien ne l'active jamais
- **Vérification téléphone (OTP)** : idem pour `phoneVerified`

### 8. Variantes produit (tailles/couleurs) — UI manquante
**Problème:** Le modèle `ProductVariant` existe en base (prix/stock par variante), mais **aucune interface** pour que le vendeur en crée. Un client ne peut donc jamais choisir "Taille M, Rouge".

### 9. Filtres par attributs (couleur, taille, matière)
Pas de modèle `CategoryAttribute`, pas de filtres sur la page produits au-delà de prix/catégorie/recherche texte.

### 10. Centre de notifications (frontend)
Le backend a un modèle `Notification` complet + envoi WhatsApp/email, mais **aucune UI** (pas de cloche, pas de liste "mes notifications") — le client ne voit ses notifs que par WhatsApp/email externe.

### 11. Gestion des catégories (admin)
Les catégories sont seedées une fois en base ; aucune UI admin pour en créer/modifier/réorganiser.

### 12. Litiges & remboursements
Pas de modèle `Dispute` ni `Refund`. Si un client n'est pas livré ou veut être remboursé, il n'existe aujourd'hui aucun mécanisme structuré (juste le support WhatsApp manuel).

### 13. KYC vendeur incomplet
Le modèle `Seller` n'a plus les champs business (nom légal, n° régistre commerce, IBAN/RIB, pièce d'identité) qui étaient prévus dans le cahier des charges initial — simplifiés lors de l'alignement du schema. À réévaluer si tu veux un vrai contrôle KYC avant paiement des vendeurs.

### 14. Recherche
`searchProducts` utilise `LIKE` PostgreSQL simple. Fonctionne pour un catalogue modeste, mais pas de tolérance aux fautes de frappe, pas de pertinence pondérée. Passage à Meilisearch/Elasticsearch recommandé au-delà de ~50k produits.

---

## 🟡 PRIORITÉ NORMALE — Qualité/robustesse

### 15. Tests
Un seul fichier de test (`ProductService.test.ts`). Aucun test pour Auth, Order, Seller, Wishlist, Payment. Pas de tests frontend. Pas de tests end-to-end.

### 16. CI/CD
Aucun workflow GitHub Actions (`.github/workflows/`) n'existe malgré la mention dans le README. Pas de vérification auto (lint/test/build) à chaque push.

### 17. Monitoring & erreurs
`SENTRY_DSN` existe dans `.env.example` mais **Sentry n'est jamais initialisé** dans le code (`@sentry/node` est en dépendance mais inutilisé).

### 18. SEO
- Pas de `generateMetadata` dynamique par produit (titre/description restent génériques partout)
- Pas de `sitemap.xml` ni `robots.txt`
- Pas de données structurées (Schema.org Product/Offer) pour les moteurs de recherche

### 19. Pages légales
Aucune page CGV/CGU, politique de confidentialité (publique — différente des paramètres de compte), politique de retour.

### 20. PWA / manifest
Pas de `manifest.json`, pas de service worker — l'app ne peut pas être "installée" sur mobile malgré le design mobile-first.

### 21. Emails transactionnels
`SendGridAdapter` existe et sait envoyer un email de confirmation de commande, mais pas de templates pour : bienvenue, réinitialisation mot de passe, produit approuvé/rejeté, payout traité.

### 22. Rate limiting ciblé
Un rate limiter global existe + un spécifique pour `/auth`, mais rien de dédié pour `/products` (création en masse) ou `/seller/imports` (abus possible).

---

## 🟢 NICE-TO-HAVE — Peut attendre

- Recommandations personnalisées ("les gens ont aussi acheté")
- Programme de fidélité (modèle `LoyaltyAccount` existe mais aucune logique d'attribution de points)
- Parrainage/referral
- Comparateur de produits
- Chat en direct vendeur ↔ client (au-delà du lien WhatsApp)
- Mode sombre
- Multi-langue (actuellement 100% français en dur)
- Export CSV des commandes/produits pour le vendeur
- App mobile native (actuellement PWA-ready seulement au niveau design, pas technique — voir #20)
- Programme d'affiliation

---

## 📊 RÉCAPITULATIF PAR MODULE

| Module | État |
|---|---|
| Auth (login/register/JWT) | ✅ Solide — manque reset password + vérification |
| Produits (CRUD, recherche, prix par palier) | 🟠 Création OK, édition/suppression manquantes |
| Panier & Checkout | ✅ Fonctionnel — manque gestion d'adresses réelle |
| Paiements (4 providers) | ✅ Adapters codés en mode mock, prêts pour clés réelles |
| Commandes | 🟠 Création/suivi client OK — gestion vendeur/admin manquante |
| Wishlist | ✅ Complet |
| Avis/Reviews | ❌ Absent |
| Upload images | ❌ Backend prêt, non branché |
| Notifications | 🟠 Backend complet, aucune UI |
| Admin (dashboard, users, sellers, produits, settings) | ✅ Solide |
| Vendeur (dashboard, produits, imports, payouts) | 🟠 Manque gestion commandes + édition produit |
| Confidentialité/RGPD | ✅ Complet |
| Design e-commerce (catégories, flash sale, scroll infini) | ✅ Complet |
| Sécurité (rate limit, helmet, CORS, JWT) | ✅ Solide |
| Tests | ❌ Quasi absent |
| CI/CD | ❌ Absent |
| SEO | ❌ Absent |
| Monitoring (Sentry) | ❌ Configuré mais pas activé |

---

## 🎯 RECOMMANDATION D'ORDRE DE TRAVAIL

```
1. Adresses (CRUD) — sans ça, personne ne peut vraiment commander
2. Upload d'images — sans ça, chaque vendeur galère à héberger ses photos
3. Gestion commandes vendeur/admin — sans ça, impossible d'honorer les ventes
4. Édition de produit — basique mais attendu
5. Reviews — booste la confiance client
6. Reste par priorité selon ton lancement (KYC si tu scales les vendeurs,
   SEO si tu comptes sur le trafic organique, tests/CI si tu as une équipe qui grandit)
```

---

**Note:** Cette liste vient d'une lecture complète du code existant, pas d'une supposition génériques. Chaque ligne correspond à quelque chose de vérifié dans les fichiers réels.
