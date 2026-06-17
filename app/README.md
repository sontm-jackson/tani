# Tani — app

Event-driven supply-chain disbursements on Stellar. A verified traceability event automatically
pays smallholder farmers in USDC; farmers cash out to local currency via an anchor.

Structure — one backend, two independently-deployable frontends, shared code:

- `api/` — TypeScript backend: event ingest, rules engine, Stellar payouts, custodial wallets, anchor cash-out. Prisma + SQLite. Deploys once.
- `operator/` — Vite + React **cooperative dashboard** (desktop web). Deploys to its own URL.
- `farmer/` — Vite + React **farmer app** (mobile-friendly). Deploys to its own URL.
- `shared/` — API client + design tokens, imported by both frontends via the `@shared` alias (no duplication).

Everything runs on **Stellar testnet**. The settled asset is a demo "USDC" issued by a local
issuer the seed creates (production swaps in Circle's real USDC issuer). Custodial keys are
**encrypted at rest** (AES-256-GCM) — testnet demo grade; production would use a KMS/HSM.

Two verticals (coffee + rice) are seeded to show the engine is **commodity-agnostic**: the same
event → rule → payout pipeline drives both, distinguished only by a config rule per commodity.

## Prerequisites

- Node 20+ (built on Node 24)
- Internet access (Stellar testnet Horizon + Friendbot)

## Setup & run

Run three terminals (backend + two frontends):

```bash
# 1. Backend
cd api
npm install
cp .env.example .env          # defaults are fine
npm run db:push               # create the SQLite database
npm run seed                  # provision issuer + pool + 8 farmers + lots + shipments (~1-2 min)
npm run dev                   # API on http://localhost:4000

# 2. Cooperative dashboard (new terminal)
cd operator
npm install
npm run dev                   # http://localhost:5173

# 3. Farmer app (new terminal)
cd farmer
npm install
npm run dev                   # http://localhost:5174
```

Open **http://localhost:5173** (cooperative) and **http://localhost:5174** (farmer, sign in with a
demo phone e.g. `+84901000001`). In dev, each frontend proxies `/api` to the backend on :4000.

## Deploying separately

The two frontends deploy to their own URLs from this one repo (Vercel / Netlify / Cloudflare Pages —
set each project's **root directory** to `operator/` or `farmer/`). The backend deploys once.

- Set `VITE_API_URL` on each frontend to the backend origin (e.g. `https://api.tani.app`). Left blank,
  it calls a relative `/api` (dev proxy). CORS is already enabled on the API.
- Optionally set `VITE_PEER_URL` to the other app's URL to show a cross-link in the header.
- Build command `npm run build`, output dir `dist/` for each frontend.

## The demo flow

The headline flow is the **QR shipment cycle** — the full physical→digital→payment loop:

1. **Farmer app** (:5174): sign in as `+84901000001`. Under **Ship a delivery**, click **Declare
   shipment**, fill in the coffee attributes (variety, weight, grade, moisture, certification),
   and **Generate QR**. That QR represents the bag the farmer ships.
2. **Cooperative app** (:5173): under **Arrivals — scan to verify & pay**, the farmer-declared shipments
   are listed (3 are pre-seeded). Click **Scan / verify** (or paste/scan the QR code) to open the
   **verification checklist**: confirm each declared field against the package, adjust the weight
   if it differs, flag any mismatch, then **Verify & pay** — the farmer is paid on the *verified*
   weight in one on-chain transaction (adjust-and-pay), or **Reject**.
3. Back on the **Farmer app** (:5174): the payment appears under **"why you were paid"**, tied to the
   shipment; **cash out** USDC to VND.

The **batch / lot flow** is also there for the aggregated model:

4. **Cooperative app** (:5173): under **Lots**, click **Verify & pay** on `LOT-2026-001` (coffee) or
   `LOT-RICE-001` (rice) to disburse to every contributing farmer at once. Two commodities prove
   the engine is commodity-agnostic. The **Anchor** card shows live SEP-1 connectivity.
5. (Optional) Drive everything from the UI: **+ Add farmer**, **+ New lot**, **+ New rule**,
   custom **Fund pool**.

To reset for a fresh demo: `cd api && npm run seed` (clears data and re-provisions).

## What's proven on testnet

- Issuing USDC, trustlines, and **batch payment** (many farmers, one transaction).
- Event → rules engine → automatic disbursement, **idempotent** (re-verifying never double-pays).
- **Two verticals** (coffee + rice) on one engine — commodity-agnostic.
- Secrets **encrypted at rest**; full add-farmer / create-lot / create-rule from the UI.
- **Live anchor connectivity** (SEP-1 fetch from testanchor; advertises SEP-10/12/6/24/31).
- Anchor **cash-out** (USDC → local currency), simulated against the pool treasury.

## Known gaps (intentional MVP scope — to close next)

- Cash-out is a simulated transfer, not a full interactive **SEP-24 withdraw** (testanchor does
  support USDC withdraw, so a real flow is feasible next; it needs the interactive KYC popup).
- Payouts use direct batch payment, not the **Stellar Disbursement Platform** (the optional
  composability upgrade).
- Demo-grade custody (encrypted SQLite, not KMS) and a demo USDC issuer (not Circle's).

## How it's commodity-agnostic

Nothing in the schema is coffee-specific (`operator · farmer · lot · contribution · rule · event
· disbursement`). A new vertical (rice, pepper, seafood) is a config template — event types, a
rule preset, and field mappings — not a new build. Coffee is the demo, not the product.

## Key endpoints (api)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/operator` | cooperative + live pool balance |
| GET | `/api/anchor/info` | live anchor connectivity (SEP-1) |
| POST | `/api/pool/fund` | mint USDC into the pool |
| POST | `/api/farmers` | add farmer (provisions a wallet) |
| POST | `/api/lots` | create a lot with contributions |
| POST | `/api/rules` | create a payout rule (new vertical) |
| POST | `/api/shipments` | farmer declares a shipment → QR token |
| GET | `/api/shipments?status=declared` | shipments awaiting arrival |
| GET | `/api/shipments/by-token/:token` | look up a scanned QR |
| POST | `/api/shipments/:id/verify` | verify + adjust-and-pay (or reject) |
| GET | `/api/lots` | lots + contributions |
| POST | `/api/lots/:id/verify` | verify a lot → auto-disburse |
| POST | `/api/events` | generic event ingest (for real traceability sources) |
| GET | `/api/disbursements` | disbursement history with tx hashes |
| GET | `/api/farmers` | roster with on-chain balances |
| GET | `/api/farmers/by-phone/:phone` | farmer sign-in |
| POST | `/api/farmers/:id/cashout` | cash out to local currency |
