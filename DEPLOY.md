# Deploying Tani

Three services on **Render** (free) + one **Neon** (free) Postgres database. HTTPS is
automatic — that's what lets the camera QR scan work on a real phone.

```
Render static  →  tani-operator   (VITE_API_URL → api)
Render static  →  tani-farmer     (VITE_API_URL → api)
Render web     →  tani-api        (Node)  ──►  Neon Postgres
```

## 1. Create the database (Neon)

- Sign up at https://neon.tech and create a project.
- Copy the connection string (it ends with `?sslmode=require`).

## 2. One-time seed (locally, pointed at Neon)

This provisions the Stellar issuer / pool / treasury and demo data into the prod DB, and
generates the secrets you'll hand to Render.

```bash
cd app/api
# put the Neon URL in app/api/.env  ->  DATABASE_URL="postgresql://...sslmode=require"
npm install
npm run db:push          # creates the tables in Neon
npm run seed             # provisions issuer, pool, treasury, farmers (writes keys to .env)
npm run fund:treasury    # buys testnet USDC for the cash-out treasury (on the DEX)
```

After `seed`, open `app/api/.env` and copy these generated values — they go into Render in
step 4:

```
ASSET_ISSUER   ISSUER_SECRET   TREASURY_SECRET   TREASURY_PUBLIC   ENCRYPTION_KEY   JWT_SECRET
```

## 3. Deploy the Blueprint

- Push to GitHub (`render.yaml` is in the repo root).
- Render → **New → Blueprint** → pick the `tani` repo. It creates `tani-api`,
  `tani-operator`, `tani-farmer`.

## 4. Set the secret env vars (the `sync: false` ones)

On **tani-api**:
- `DATABASE_URL` → the Neon string
- `ENCRYPTION_KEY`, `JWT_SECRET`, `ASSET_ISSUER`, `ISSUER_SECRET`, `TREASURY_SECRET`,
  `TREASURY_PUBLIC` → the values from step 2
- (optional) `FIREBASE_*` for real phone OTP — otherwise the app runs dev OTP (code on screen)

On **tani-operator** and **tani-farmer**:
- `VITE_API_URL` → the API **origin, with NO `/api`** — e.g. `https://tani-api-xxxx.onrender.com`
  (the client appends `/api` itself; adding it here gives a broken `/api/api/...`).

Redeploy the two frontends after setting `VITE_API_URL` — Vite bakes it in at build time.

## Notes

- The free API **spins down after ~15 min idle**; the next request waits ~30-50s to wake.
  Upgrade just that one service if you want a smooth always-on link for judges.
- **Never commit `.env`** — it stays local; the live secrets live in Render's dashboard.
- The seed regenerates the USDC issuer each run, so only seed the prod DB **once**; after that
  the issuer is fixed by the env vars.
