# Tani

**Get farmers paid the moment their delivery is verified — and prove it on-chain.**

Tani is a payment app for agricultural cooperatives, built on [Stellar](https://stellar.org). A smallholder
farmer declares a delivery in the app and gets a QR on their phone. When they bring their crop to the
cooperative, the co-op scans the QR, weighs it, and verifies it on arrival — and that verification instantly
pays the farmer in USDC on Stellar. The farmer cashes out to local currency through a Stellar anchor, and
every payout is provable on-chain.

Built for the APAC Stellar Hackathon 2026. Working on **Stellar testnet** today.

- **Live demo:** https://tani-operator.onrender.com (cooperative — sign in `coop@tani.app` / `tani1234`) and https://tani-farmer.onrender.com (farmer)
- Demo video: _add link_
- Pitch deck: _add link_

---

## Why now — EUDR

The EU Deforestation Regulation (EUDR) now bars importing coffee unless every lot carries GPS-level farm
geolocation and proof it's deforestation-free. Vietnam is the EU's largest robusta supplier, and its
exporters are scrambling for farm-level data they've never collected. Tani turns instant payment into the
incentive that makes farmers hand over the exact geolocation the exporter is now legally required to
collect — compliance as a byproduct of getting paid.

## The idea

Traceability systems only *record* events; payment systems only move money when a human says so. Nobody
connects the two. Tani is the bridge: the verified delivery itself releases the payment.

## How it works

1. **Declare** — the farmer declares a delivery in the app and gets a QR on their phone (no printing).
2. **Verify** — the cooperative scans the QR on arrival, weighs the crop, and confirms quality.
3. **Pay** — that verification triggers an instant on-chain USDC payment to the farmer, on the verified weight.
4. **Cash out** — the farmer withdraws to local currency through a Stellar anchor (SEP-24).
5. **Prove** — every payment is on-chain and tied to the verified delivery; the co-op keeps the farmer's
   geolocation for EU buyers.

## Traceability & proof

Every payment is also a proof-of-origin record. The cooperative's **Trace explorer** lets a buyer search any
bag's QR or an export lot and see its exact origin farms on a map — each with its GPS geolocation, farm size,
approved-pin status, and a link to the on-chain transaction that paid the grower. That's the farm-level
dossier the EUDR requires *and* the impact proof a buyer wants, in one view.

## Why Stellar

- **Anchors + SEP-10 / SEP-24** — a real, working farmer cash-out to local currency, a standardized off-ramp
  protocol no other chain has.
- **Native USDC + batch payments** — many farmers paid in one atomic transaction, in stable digital dollars.
- **Stellar Classic** — built-in payment operations, no custom contract to audit.

## On-chain / contract addresses

Tani settles on **Stellar testnet** and is built on **Stellar Classic** (payment operations + SEP anchors);
it does not deploy a custom Soroban contract. The on-chain asset it settles through is USDC, whose Stellar
Asset Contract (SAC) and issuer are:

- **USDC Stellar Asset Contract (SAC):** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- **USDC issuer (SEP-24 cash-out asset):** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- **Anchor:** `testanchor.stellar.org` (SEP-10 web auth + SEP-24 interactive withdraw)
- **Example on-chain cash-out:**
  https://stellar.expert/explorer/testnet/tx/3b16920edaa0bf85263c397e8b1f69374a45031ae7fc210f446927b994dd8f1e

The demo-economy USDC issuer and the pool / treasury accounts are generated fresh by `npm run seed` and
written to `app/api/.env`.

## Repository layout

```
app/
  api/        TypeScript backend — event -> rule -> payout engine, custodial wallets,
              real SEP-10 / SEP-24 anchor cash-out (Express + Prisma/SQLite + Stellar SDK)
  operator/   Cooperative dashboard (React) — scan-and-pay, rules, roster, on-chain proof, EUDR map
  farmer/     Farmer app (React, mobile) — declare deliveries, get paid, cash out
  shared/     Shared API client + design tokens used by both frontends
```

See **[app/README.md](app/README.md)** for full setup and deployment notes.

## Quick start

```bash
# backend — provisions issuer, pool, treasury, farmers on testnet (~1-2 min)
cd app/api && npm install && cp .env.example .env && npm run db:push && npm run seed

# IMPORTANT: seed regenerates the USDC issuer into .env — start the API AFTER seeding
npm run dev                                     # http://localhost:4000

# fund the cash-out treasury with testnet USDC (buys it on the DEX)
npm run fund:treasury

# cooperative dashboard (new terminal)            login: coop@tani.app / tani1234
cd app/operator && npm install && npm run dev     # http://localhost:5173

# farmer app (new terminal)
cd app/farmer && npm install && npm run dev        # http://localhost:5174
```

## Status & honest notes

Hackathon MVP on **testnet**:

- **Cash-out is a real SEP-10 + SEP-24 withdraw** against the SDF reference anchor (`testanchor.stellar.org`):
  the farmer's USDC genuinely leaves their wallet to the anchor on-chain. The anchor's **fiat payout is
  simulated** (it's a reference anchor) — production swaps it for a licensed Vietnamese anchor for the real
  VND off-ramp. There is no live VND anchor on Stellar today.
- The demo economy settles a self-issued test "USDC"; the SEP-24 cash-out swaps it 1:1 for the anchor's USDC.
  Production runs on a single real (Circle) USDC.
- Wallets are custodial with keys **encrypted at rest** (demo grade; production would use a KMS/HSM).
- Payouts use direct batch payments; the Stellar Disbursement Platform is a planned, drop-in upgrade.

## License

MIT
