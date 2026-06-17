// M0 validation: prove the full Stellar rail on testnet before building on it.
// Creates issuer + pool + 2 farmers, issues USDC, batch-pays the farmers, prints proof.
// Run: npm run smoke
import { Asset } from "@stellar/stellar-sdk";
import { createKeypair, fundWithFriendbot, setTrustline, getAssetBalance, sleep } from "./account.js";
import { issueAsset, batchPay } from "./payments.js";
import { explorerTx } from "../config.js";

async function main() {
  console.log("Tani M0 smoke test — Stellar testnet\n");

  console.log("1. Creating accounts (issuer, pool, 2 farmers)...");
  const issuer = createKeypair();
  const pool = createKeypair();
  const farmerA = createKeypair();
  const farmerB = createKeypair();

  console.log("2. Funding all via Friendbot...");
  for (const acct of [issuer, pool, farmerA, farmerB]) {
    await fundWithFriendbot(acct.publicKey);
    await sleep(400);
  }

  const USDC = new Asset("USDC", issuer.publicKey);

  console.log("3. Setting USDC trustlines (pool + farmers)...");
  await setTrustline(pool.secret, USDC);
  await setTrustline(farmerA.secret, USDC);
  await setTrustline(farmerB.secret, USDC);

  console.log("4. Issuer mints 1000 USDC into the pool...");
  await issueAsset(issuer.secret, pool.publicKey, USDC, 1000);
  console.log("   pool USDC:", await getAssetBalance(pool.publicKey, "USDC"));

  console.log("5. Pool batch-pays farmer A (60) and farmer B (40) in ONE transaction...");
  const hash = await batchPay(
    pool.secret,
    USDC,
    [
      { destination: farmerA.publicKey, amount: 60 },
      { destination: farmerB.publicKey, amount: 40 },
    ],
    "Tani smoke payout"
  );

  console.log("\n   tx:", hash);
  console.log("   explorer:", explorerTx(hash));
  console.log("   farmer A USDC:", await getAssetBalance(farmerA.publicKey, "USDC"));
  console.log("   farmer B USDC:", await getAssetBalance(farmerB.publicKey, "USDC"));

  console.log("\nM0 PASS — issue, trustline, and batch payout all work on testnet.");
}

main().catch((e) => {
  console.error("\nM0 FAIL:", e?.response?.data?.extras?.result_codes ?? e?.message ?? e);
  process.exit(1);
});
