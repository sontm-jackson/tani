import { Asset } from "@stellar/stellar-sdk";
import { createKeypair, fundWithFriendbot, setTrustline, sleep } from "../stellar/account.js";
import { anchorUsdc } from "../stellar/client.js";

// Provision a custodial Stellar wallet: create, fund with XLM, set the internal USDC
// trustline and the anchor-USDC trustline (so the farmer can receive the swapped asset
// at cash-out and run a real SEP-24 withdraw). Farmers never see keys — Tani manages them
// (testnet demo; production uses real custody/KYC).
export async function provisionWallet(
  asset: Asset
): Promise<{ publicKey: string; secret: string; anchorTrustline: boolean }> {
  const kp = createKeypair();
  await fundWithFriendbot(kp.publicKey);
  await sleep(300);
  await setTrustline(kp.secret, asset);
  let anchorTrustline = false;
  try {
    await sleep(300);
    await setTrustline(kp.secret, anchorUsdc());
    anchorTrustline = true;
  } catch {
    // Non-fatal: the anchor trustline can be backfilled later (ensureAnchorTrustline).
  }
  return { ...kp, anchorTrustline };
}

// Ensure a wallet trusts the anchor's USDC (idempotent). Used to backfill wallets
// provisioned before the anchor trustline existed, just before a cash-out.
export async function ensureAnchorTrustline(secret: string): Promise<void> {
  await setTrustline(secret, anchorUsdc());
}
