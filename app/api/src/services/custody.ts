import { Asset } from "@stellar/stellar-sdk";
import { createKeypair, fundWithFriendbot, setTrustline, sleep } from "../stellar/account.js";

// Provision a custodial Stellar wallet: create, fund with XLM, set the USDC trustline.
// Farmers never see keys — Tani manages them (testnet demo; production uses real custody/KYC).
export async function provisionWallet(asset: Asset): Promise<{ publicKey: string; secret: string }> {
  const kp = createKeypair();
  await fundWithFriendbot(kp.publicKey);
  await sleep(300);
  await setTrustline(kp.secret, asset);
  return kp;
}
