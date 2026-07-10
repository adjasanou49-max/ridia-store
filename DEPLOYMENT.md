# 🚀 Déploiement Ridia Store — Railway + Vercel

## Vue d'ensemble

```
GitHub repo (mono-repo)
    ├── backend/   → déployé sur Railway (API + Postgres + Redis + Worker)
    └── frontend/  → déployé sur Vercel (Next.js)
```

---

## 1. Préparer le repo GitHub

```bash
cd ridia-store
git init
git add .
git commit -m "Initial commit: Ridia Store"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/ridia-store.git
git push -u origin main
```

---

## 2. Backend sur Railway

1. **railway.app** → New Project → Deploy from GitHub repo → sélectionne `ridia-store`
2. Railway détecte plusieurs dossiers : configure le service pour utiliser `backend/` comme **Root Directory**
   (Settings → Root Directory → `backend`)
3. **Add Service → PostgreSQL** (Railway génère automatiquement `DATABASE_URL`)
4. **Add Service → Redis** (Railway génère automatiquement `REDIS_URL` — appelle-le `REDIS_PRIVATE_URL` ou similaire selon le plugin, à mapper vers `REDIS_URL` dans les variables du service backend)
5. **Variables d'environnement du service backend** (Settings → Variables) :

```env
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://ton-domaine.vercel.app

DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

JWT_ACCESS_SECRET=<génère avec: openssl rand -hex 32>
JWT_REFRESH_SECRET=<génère avec: openssl rand -hex 32>
ENCRYPTION_KEY=<exactement 32 caractères>

CINETPAY_API_KEY=...
CINETPAY_SITE_ID=...
CINETPAY_SECRET_KEY=...
CINETPAY_MODE=live

WAVE_API_KEY=...
WAVE_MODE=live

ORANGE_MONEY_CLIENT_ID=...
ORANGE_MONEY_CLIENT_SECRET=...
ORANGE_MONEY_MODE=live

MTN_MOMO_API_KEY=...
MTN_MOMO_USER_ID=...
MTN_MOMO_SUBSCRIPTION_KEY=...
MTN_MOMO_MODE=live

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=ridia_webhook_verify
WHATSAPP_MODE=live

SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=no-reply@ridia-store.com
SENDGRID_MODE=live

STORAGE_PROVIDER=bunny
BUNNY_API_KEY=...
BUNNY_STORAGE_ZONE=ridia-store
BUNNY_PULL_ZONE_URL=https://ridia-store.b-cdn.net

CNY_TO_XOF_RATE=90
SENTRY_DSN=...
```

6. **Build & Start commands** (Settings → Deploy) :
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npx prisma migrate deploy && node dist/index.js`

7. Railway déploie automatiquement à chaque `git push` sur `main`.

8. **Worker séparé** (imports async + notifications) : crée un **second service** dans le même
   projet Railway, même repo, même Root Directory `backend`, mais :
   - Start command : `npx prisma generate && npm run worker`
   - Pas besoin d'exposer de port public pour ce service

9. Note ton URL Railway (ex: `https://ridia-store-backend.up.railway.app`) — tu en auras besoin pour Vercel.

---

## 3. Frontend sur Vercel

1. **vercel.com** → Import Project → sélectionne le repo `ridia-store`
2. **Root Directory** → `frontend`
3. Vercel détecte Next.js automatiquement
4. **Variables d'environnement** (Settings → Environment Variables) :

```env
NEXT_PUBLIC_API_URL=https://ridia-store-backend.up.railway.app/api
```

5. Deploy. Vercel te donne une URL (`https://ridia-store.vercel.app`).

6. **Retourne sur Railway** et mets à jour `FRONTEND_URL` avec cette URL Vercel (utile pour les CORS
   et les liens dans les emails/WhatsApp).

---

## 4. Webhooks des providers de paiement

Une fois en ligne, configure les URLs de webhook dans chaque dashboard provider :

| Provider | URL webhook |
|----------|-------------|
| CinetPay | `https://TON_BACKEND/api/webhooks/cinetpay` |
| Wave | `https://TON_BACKEND/api/webhooks/wave` |
| Orange Money | `https://TON_BACKEND/api/webhooks/orange-money` |
| MTN MoMo | `https://TON_BACKEND/api/webhooks/mtn-momo` |
| WhatsApp | `https://TON_BACKEND/api/webhooks/whatsapp` (+ `WHATSAPP_VERIFY_TOKEN` pour la vérification) |

---

## 5. Première initialisation de la base en production

```bash
# Depuis ta machine locale, en pointant vers la DB de prod :
DATABASE_URL="<url-postgres-railway>" npx prisma migrate deploy
DATABASE_URL="<url-postgres-railway>" npx prisma db seed
```

Ou directement via le terminal Railway (Settings → onglet Console du service backend).

**Change immédiatement le mot de passe du compte `admin@ridia-store.com` créé par le seed.**

---

## 6. Checklist finale

- [ ] Backend répond : `curl https://TON_BACKEND/api/health`
- [ ] Frontend charge : ouvre l'URL Vercel
- [ ] Connexion admin fonctionne (`/login` puis `/admin/dashboard`)
- [ ] Un client peut s'inscrire (toujours en `CUSTOMER`, jamais admin)
- [ ] Un paiement test passe (mode `mock` d'abord, puis `live`)
- [ ] Webhooks des 4 providers configurés
- [ ] Worker tourne (vérifie les logs Railway du service worker)
- [ ] Sentry reçoit bien les erreurs (déclenche une erreur test)
- [ ] Domaine personnalisé configuré (optionnel) sur Vercel + Railway

---

## 🔄 Mises à jour futures

Chaque `git push origin main` redéploie automatiquement Railway ET Vercel. Pour les changements
de schema Prisma, la commande `npx prisma migrate deploy` au démarrage du service backend
applique les migrations en attente automatiquement.
