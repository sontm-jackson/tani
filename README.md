# Tani

**Get farmers paid the moment their product is verified.**

Tani is an event-driven supply-chain disbursement app on the [Stellar](https://stellar.org) network.
When a smallholder farmer's delivery is verified by a cooperative, Tani automatically pays the farmer
in USDC — instantly, on-chain, with proof — and the farmer can cash out to local currency.

Built for the APAC Stellar Hackathon 2026. Runs on **Stellar testnet**.

---

## The idea

Today, agricultural traceability systems only *record* events, and payment systems only move money when
a human tells them to. Nobody connects the two. Tani is the bridge: a verified real-world event releases
the payment automatically.

A farmer brings a bag of coffee. They declare it in the app (variety, weight, grade, moisture,
certification) and get a QR to attach. The cooperative scans it on arrival, checks the package against the
declaration, and pays on the verified weight — one on-chain USDC transaction. The farmer is paid in
seconds and can withdraw to a bank or mobile-money account through a Stellar anchor.

## How it works

1. **Farmer** creates a shipment in the app and gets a QR for the bag.
2. **Cooperative** scans the QR on arrival, verifies each declared attribute, and pays on the verified
   weight (adjust-and-pay) — a single on-chain batch payment in USDC.
3. **Farmer** sees the payment instantly and withdraws to a local payout destination via an anchor.

## Why Stellar

- **Native USDC** for stable-value payouts to unbanked farmers.
- **Built-in batch payments** — pay many farmers in one transaction, for fractions of a cent.
- **The anchor / SEP framework** for converting USDC to local currency (the cash-out last mile).

## Repository layout

```
app/
  api/        TypeScript backend — event ingest, rules engine, Stellar payouts,
              custodial wallets, anchor cash-out (Express + Prisma/SQLite + Stellar SDK)
  operator/   Cooperative dashboard (React) — deploys to its own URL
  farmer/     Farmer app (React PWA) — deploys to its own URL
  shared/     Shared API client + design tokens used by both frontends
```

One backend, two independently-deployable frontends. See **[app/README.md](app/README.md)** for full
setup, the demo flow, and deployment notes.

## Quick start

```bash
# backend
cd app/api && npm install && cp .env.example .env && npm run db:push && npm run seed && npm run dev

# cooperative dashboard (new terminal)
cd app/operator && npm install && npm run dev    # http://localhost:5173

# farmer app (new terminal)
cd app/farmer && npm install && npm run dev       # http://localhost:5174
```

The seed provisions a demo Lâm Đồng coffee cooperative (issuer, pool, farmers, lots, shipments) on
Stellar testnet — it takes a minute or two.

## Status & honest notes

This is a hackathon MVP on **testnet**. Deliberate demo-scope simplifications:

- The settled asset is a demo "USDC" from a test issuer (production: Circle's USDC).
- Wallets are custodial with keys **encrypted at rest** (demo grade; production would use a KMS/HSM).
- Cash-out and farmer payout destinations are **simulated** against the SDF reference anchor
  (`testanchor.stellar.org`); production routes to a licensed local anchor. There is no live VND anchor
  on Stellar today, so USDC is the core and local-currency cash-out is the anchor last mile.
- Payouts use direct batch payments; the Stellar Disbursement Platform is a planned upgrade.

## License

MIT
