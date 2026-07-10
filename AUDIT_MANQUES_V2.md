# 🔍 AUDIT RIDIA STORE — État au 5 juillet 2026

**Vérifié ligne par ligne dans le code actuel** (51 fichiers backend, 33 routes frontend, 23 modèles Prisma) — pas de suppositions.

---

## ✅ CE QUI EST SOLIDE (ne pas refaire)

Auth complète (register/login/JWT/forgot password/vérif email+OTP téléphone), produits (CRUD, prix par palier, poids, vidéo, traduction auto, modération IA), panier/checkout/paiements (4 providers + slot pour ta 5e API), commandes (client + vendeur + admin, annulation, tracking), avis (organiques + importés, tri intelligent), wishlist, adresses (CRUD + pays du monde), upload images, recherche avec aperçu + scroll infini, multi-devises, marges (par catégorie + audit produit par produit, fusionnés en une page), agent IA anti-fournisseur, sécurité (fuites corrigées, séparation stricte client/admin/toi), design e-commerce (catégories, flash sale, petits prix, prix qui augmente), légal (CGV/confidentialité/retours), SEO de base (sitemap/robots), PWA manifest, import CSV massif.

---

## 🔴 PRIORITÉ HAUTE — Vrais manques fonctionnels

### 1. Édition de produit — pas d'interface !
**Découverte en auditant :** la route backend `PATCH /products/:id` existe et fonctionne, mais **aucun bouton "Modifier" n'existe dans "Mes produits"** côté vendeur. Un vendeur peut créer un produit et le voir dans la liste, mais ne peut jamais corriger une faute de frappe, changer le stock, ou ajuster le prix après coup sans repasser par la base de données.

### 2. Variantes produit (tailles/couleurs) — aucune interface
Le modèle `ProductVariant` existe en base (prix/stock par variante), mais rien ne permet à un vendeur d'en créer. Impossible aujourd'hui de vendre "Taille M rouge / Taille L bleu" avec un stock distinct par combinaison.

### 3. Filtres par attribut (couleur, taille, matière)
Aucun modèle `CategoryAttribute` en base. La recherche ne filtre que par prix/catégorie/texte — pas moyen pour un client de dire "seulement en rouge" ou "taille L uniquement".

### 4. Suppression de produit = archivage seulement
`archiveProduct` change juste le statut à `ARCHIVED`, jamais de vraie suppression. C'est **volontaire et correct** (intégrité des commandes passées), mais aucune UI n'existe pour qu'un vendeur "désarchive" un produit — une fois archivé, il est coincé.

---

## 🟠 PRIORITÉ MOYENNE

### 5. Litiges & remboursements
Aucun modèle `Dispute` ni `Refund`. Si un client n'est pas livré, le seul recours est le contact manuel (WhatsApp/support) — pas de suivi structuré.

### 6. Centre de notifications (frontend)
Le backend a un système complet (email + WhatsApp), mais **aucune UI** — pas de cloche, pas de liste "mes notifications" dans l'app elle-même.

### 7. Personnalisation boutique vendeur
Le modèle `Seller` a `storeLogoUrl`/`storeBanner` mais aucune page ne permet à un vendeur de les configurer ou de personnaliser sa vitrine.

### 8. Codes promo / coupons
Aucun modèle. Pas de "10% avec le code BIENVENUE" possible actuellement.

### 9. Programme de fidélité — à moitié construit
Le modèle `LoyaltyAccount` existe (points, tier) mais rien n'attribue jamais de points automatiquement, et aucune page client ne les affiche.

### 10. Parrainage
Pas de modèle `Referral`. Retiré lors d'un nettoyage de schema — à reconstruire si tu veux cette fonctionnalité.

---

## 🟡 QUALITÉ / ROBUSTESSE (invisible pour l'utilisateur, important pour la fiabilité)

### 11. Tests — quasi inexistants
**Un seul fichier de test** dans tout le projet (`ProductService.test.ts`, teste juste le calcul de prix). Aucun test pour Auth, Order, Paiements, Wishlist, Reviews, l'agent IA. Si quelqu'un modifie le code plus tard sans y toucher, rien ne détecte une régression.

### 12. CI/CD — aucun
Pas de `.github/workflows`. Chaque `git push` part directement en production sans vérification automatique (lint/test/build).

### 13. 2FA (double authentification)
Le changement de mot de passe révoque déjà tous les tokens (bonne pratique), mais pas de vraie 2FA (code TOTP/app d'authentification) pour un niveau de sécurité supérieur.

### 14. Sentry configuré mais jamais vérifié en conditions réelles
Le code est prêt (`Sentry.init` actif), mais `SENTRY_DSN` est vide dans `.env.example` — tant que tu n'as pas mis ta vraie clé et déclenché une erreur test, on ne sait pas si ça capture vraiment.

---

## 📊 RÉCAPITULATIF PAR MODULE

| Module | État |
|---|---|
| Produits — création, prix, traduction, modération | ✅ Solide |
| Produits — édition, variantes, filtres attributs | 🔴 Manquant |
| Commandes & paiements | ✅ Solide |
| Litiges/remboursements structurés | 🔴 Manquant |
| Avis, wishlist, adresses | ✅ Solide |
| Notifications backend | ✅ Solide |
| Notifications frontend (centre, cloche) | 🟠 Manquant |
| Marges, devises, IA modération | ✅ Solide et bien séparé |
| Fidélité/parrainage/coupons | 🟠 Partiel à absent |
| Sécurité (fuites, rôles) | ✅ Audité et corrigé |
| Tests | 🔴 Quasi absent |
| CI/CD | 🔴 Absent |
| SEO/PWA | ✅ Base posée |

---

## 🎯 MON CONSEIL D'ORDRE

```
1. Édition produit (UI) — le plus urgent, un vendeur ne peut pas corriger ses erreurs
2. Variantes produit — attendu dès qu'il y a plus d'un type de vêtement
3. Notifications frontend — pour que le client voie ce qui se passe sans WhatsApp
4. Litiges structurés — protection client/vendeur en cas de problème
5. Tests + CI/CD — quand tu commences à avoir une équipe ou un rythme de mise à jour soutenu
6. Fidélité/coupons/parrainage — leviers marketing, pas urgents pour lancer
```

---

**Méthode :** chaque ligne de ce document correspond à une vérification réelle dans le code (grep, lecture de fichiers), pas à une supposition générique.
