# 🛍️ Ridia Store

Marketplace e-commerce pour la francophonie ouest-africaine (Burkina Faso, Mali, Sénégal, Côte d'Ivoire).
Import direct depuis 1688 / Taobao / Pinduoduo, paiements mobile money, notifications WhatsApp.

## 📁 Structure du projet

```
ridia-store/
├── backend/          API Node.js/Express + Prisma + BullMQ
├── frontend/          Next.js 16 (App Router) + TailwindCSS
└── docker-compose.yml  Lance tout en local (Postgres + Redis + API + Web)
```

## 🚀 Démarrage rapide (local avec Docker)

### Prérequis
- Docker + Docker Compose installés
- Node.js 20+ (si tu veux lancer sans Docker)

### 1. Configuration des variables d'environnement

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Édite `backend/.env` et remplis au minimum :
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (chaînes aléatoires longues)
- `ENCRYPTION_KEY` (exactement 32 caractères)
- Les clés API (Wave, WhatsApp, etc.) — laisse vide en mode `mock` pour tester sans vrais comptes

### 2. Lancer avec Docker Compose

```bash
docker-compose up --build
```

Ça démarre :
- **Postgres** sur `localhost:5432`
- **Redis** sur `localhost:6379`
- **Backend API** sur `http://localhost:4000`
- **Worker** (imports async, notifications)
- **Frontend** sur `http://localhost:3000`

### 3. Initialiser la base de données

Dans un autre terminal :

```bash
docker-compose exec backend npx prisma migrate dev --name init
docker-compose exec backend npx prisma db seed
```

Ça crée :
- Un compte **SUPER_ADMIN** : `admin@ridia-store.com` / `ChangeMe123!`
- Un compte **SELLER** de démo : `seller-demo@ridia-store.com` / `SellerDemo123!`
- Les catégories de base (Mode Femme, Chaussures, Tissus Wax, etc.)

⚠️ **Change le mot de passe admin immédiatement après ta première connexion.**

### 4. Ouvrir l'app

Va sur **http://localhost:3000** 🎉

---

## 🖥️ Démarrage sans Docker (dev local)

### Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run dev        # API sur :4000

# Dans un autre terminal, lance le worker BullMQ (imports, notifications)
npm run worker
```

### Frontend

```bash
cd frontend
npm install
npm run dev         # Web sur :3000
```

Nécessite Postgres + Redis tournant localement (ou pointer `DATABASE_URL`/`REDIS_URL` vers des instances distantes).

---

## 🔐 Rôles & permissions

| Rôle | Accès |
|------|-------|
| `CUSTOMER` | Achats, commandes, panier (par défaut à l'inscription) |
| `SELLER` | + Gestion de ses produits, imports 1688/Taobao, demandes de payout |
| `ADMIN` | + Approbation vendeurs/produits, modération, vue globale commandes |
| `SUPER_ADMIN` | + Promotion d'utilisateurs en admin, paramètres système |

**Aucun rôle admin ne peut être obtenu via l'inscription publique.** Le premier `SUPER_ADMIN`
est créé via `prisma db seed`. Pour créer d'autres admins, connecte-toi en SUPER_ADMIN et utilise
`PATCH /api/admin/users/:id/role`.

Voir le middleware `backend/src/middleware/auth.ts` (`authenticate` + `authorize`) pour le détail
de la protection — chaque route sensible vérifie le rôle côté serveur, indépendamment de l'UI.

---

## 💳 Paiements

3 providers déjà intégrés (adapters dans `backend/src/integrations/payments/`) :
- **Wave**
- **Orange Money**
- **MTN Mobile Money**

Chaque adapter tourne en mode `mock` par défaut (`WAVE_MODE=mock` etc. dans `.env`) —
ça simule un paiement réussi sans appeler la vraie API, pratique pour développer sans comptes réels.
Passe en `live` une fois tes comptes marchands approuvés.

### 🔌 Brancher une future API (paiement ou autre)

Un 5ᵉ adapter `CustomPaymentAdapter.ts` est déjà prêt et enregistré dans le système
(`PaymentProviderRegistry.ts`), en attente d'une vraie API. Pour l'activer quand tu
auras ta clé :

1. Ouvre `backend/src/integrations/payments/CustomPaymentAdapter.ts`
2. Remplis les 3 méthodes (`initiatePayment`, `verifyPayment`, `handleWebhook`) avec
   les vrais appels HTTP de la documentation du provider
3. Ajoute `CUSTOM_PAYMENT_API_KEY` et `CUSTOM_PAYMENT_BASE_URL` dans `.env`
4. Configure l'URL de webhook chez le provider : `https://TON_BACKEND/api/webhooks/custom`

**Aucun autre fichier à toucher** — OrderService, les routes, et le frontend
fonctionnent déjà avec n'importe quel provider grâce à ce pattern adapter. Le même
principe s'applique à toute autre intégration future (logistique, SMS, etc.) :
une nouvelle classe qui respecte l'interface, zéro fichier existant modifié.

---

## 📦 Import de produits (1688 / Taobao / Pinduoduo)

Le vendeur peut lancer un import en masse via `POST /api/seller/imports` avec des lignes
`{ url, name, priceCny, categoryId, stockQuantity, images, ... }`. Le job est traité de façon
asynchrone par le worker BullMQ (`npm run worker`), qui calcule le prix XOF final via la formule
cascade : `prixCNY × tauxChange × (1 + margePercent/100)`, arrondi à 50 XOF.

Voir `backend/src/services/ProductImportService.ts` et `backend/src/queues/worker.ts`.

---

## 🧪 Tests

```bash
cd backend
npm test
```

---

## 🚢 Déploiement production

Voir [`DEPLOYMENT.md`](./DEPLOYMENT.md) pour le guide complet (Railway + Vercel).

---

## 🛠️ Stack technique

**Backend:** Node.js 20, TypeScript, Express, Prisma (PostgreSQL), BullMQ (Redis), Zod, JWT
**Frontend:** Next.js 16 (App Router), React 18, TailwindCSS, React Query, Zustand
**Paiements:** Wave, Orange Money, MTN MoMo
**Notifications:** WhatsApp Business API, SendGrid
**Sourcing:** Connecteurs 1688 / Taobao / Pinduoduo (import manuel + bulk CSV)
