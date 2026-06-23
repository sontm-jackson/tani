import {
  Keypair,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Asset,
} from "@stellar/stellar-sdk";
import { horizon } from "./client.js";
import { config, networkPassphrase } from "../config.js";

export interface NewAccount {
  publicKey: string;
  secret: string;
}

export function createKeypair(): NewAccount {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

// Fund a brand-new testnet account with XLM from Friendbot. Retries — friendbot is flaky.
export async function fundWithFriendbot(publicKey: string, tries = 4): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${config.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
      if (res.ok) return;
      // Account may already exist (op_already_exists) — treat as success.
      const body = await res.text();
      if (body.includes("op_already_exists") || res.status === 400) {
        try {
          await horizon.loadAccount(publicKey);
          return; // already funded
        } catch {
          /* fall through to retry */
        }
      }
      lastErr = new Error(`friendbot ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(1500 * (i + 1));
  }
  throw lastErr ?? new Error("friendbot failed");
}

// Establish a trustline so the account can hold our asset.
export async function setTrustline(secret: string, asset: Asset, limit = "1000000000"): Promise<string> {
  const kp = Keypair.fromSecret(secret);
  const account = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset, limit }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

export async function getBalances(
  publicKey: string
): Promise<{ asset: string; balance: string }[]> {
  const account = await horizon.loadAccount(publicKey);
  return account.balances.map((b: any) => ({
    asset: b.asset_type === "native" ? "XLM" : `${b.asset_code}`,
    balance: b.balance,
  }));
}

// Balance of an asset. When a wallet trusts two assets with the same code but
// different issuers (e.g. our internal USDC and the anchor's USDC), pass `issuer`
// to read the right one — otherwise the first code match wins.
export async function getAssetBalance(publicKey: string, code: string, issuer?: string): Promise<number> {
  try {
    const account = await horizon.loadAccount(publicKey);
    const found = account.balances.find((b: any) =>
      code === "XLM"
        ? b.asset_type === "native"
        : b.asset_code === code && (!issuer || b.asset_issuer === issuer)
    );
    return found ? Number(found.balance) : 0;
  } catch {
    return 0;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
