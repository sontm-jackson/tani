import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { config, networkPassphrase } from "../config.js";

// Raw SEP-10 (web auth) + SEP-24 (interactive withdraw) client against the anchor
// advertised by ANCHOR_HOME_DOMAIN (testanchor.stellar.org on testnet). Endpoints are
// resolved live from the anchor's stellar.toml so nothing is hardcoded.

export interface AnchorEndpoints {
  webAuth: string;
  sep24: string;
  sep6: string;
  kyc: string;
  signingKey?: string;
  networkPassphrase?: string;
}

let cache: { at: number; data: AnchorEndpoints } | null = null;

export async function resolveAnchor(): Promise<AnchorEndpoints> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.data;
  const tomlUrl = `https://${config.anchorHomeDomain}/.well-known/stellar.toml`;
  const res = await fetch(tomlUrl);
  if (!res.ok) throw new Error(`anchor toml ${res.status}`);
  const toml = await res.text();
  const data: AnchorEndpoints = {
    webAuth: field(toml, "WEB_AUTH_ENDPOINT") ?? "",
    sep24: stripSlash(field(toml, "TRANSFER_SERVER_SEP0024") ?? ""),
    sep6: stripSlash(field(toml, "TRANSFER_SERVER") ?? ""),
    kyc: stripSlash(field(toml, "KYC_SERVER") ?? ""),
    signingKey: field(toml, "SIGNING_KEY"),
    networkPassphrase: field(toml, "NETWORK_PASSPHRASE"),
  };
  if (!data.webAuth || !data.sep24) {
    throw new Error("anchor TOML missing WEB_AUTH_ENDPOINT or TRANSFER_SERVER_SEP0024");
  }
  cache = { at: Date.now(), data };
  return data;
}

// SEP-10: fetch a challenge for `account`, sign it with the account's key, exchange it
// for a session JWT. The signer must control the account that will move the funds.
export async function sep10Authenticate(secret: string): Promise<string> {
  const a = await resolveAnchor();
  const kp = Keypair.fromSecret(secret);
  const url = `${a.webAuth}?account=${kp.publicKey()}&home_domain=${encodeURIComponent(
    config.anchorHomeDomain
  )}`;
  const chRes = await fetch(url);
  if (!chRes.ok) throw new Error(`SEP-10 challenge ${chRes.status}: ${(await chRes.text()).slice(0, 200)}`);
  const ch = await chRes.json();
  const passphrase = ch.network_passphrase ?? a.networkPassphrase ?? networkPassphrase;
  const tx = TransactionBuilder.fromXDR(ch.transaction, passphrase);
  tx.sign(kp);
  const tokRes = await fetch(a.webAuth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  });
  if (!tokRes.ok) throw new Error(`SEP-10 token ${tokRes.status}: ${(await tokRes.text()).slice(0, 200)}`);
  const { token } = await tokRes.json();
  if (!token) throw new Error("SEP-10 returned no token");
  return token;
}

export interface Interactive {
  type: string;
  url: string;
  id: string;
}
export type InteractiveWithdraw = Interactive;

// SEP-24: start an interactive deposit (used to fund the treasury with anchor USDC).
export async function sep24DepositInteractive(
  token: string,
  account: string,
  amount?: number
): Promise<Interactive> {
  const a = await resolveAnchor();
  const res = await fetch(`${a.sep24}/transactions/deposit/interactive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_code: config.assetCode,
      account,
      ...(amount ? { amount: String(amount) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`SEP-24 deposit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// SEP-24: start an interactive withdraw. Returns the anchor-hosted URL the user opens
// to complete KYC and pick how they want the cash, plus the transaction id to poll.
export async function sep24WithdrawInteractive(
  token: string,
  account: string,
  amount?: number,
  prefill?: Record<string, string>
): Promise<InteractiveWithdraw> {
  const a = await resolveAnchor();
  const res = await fetch(`${a.sep24}/transactions/withdraw/interactive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_code: config.assetCode,
      account,
      ...(amount ? { amount: String(amount) } : {}),
      // SEP-9 fields the anchor uses to pre-fill its hosted form.
      ...(prefill ?? {}),
    }),
  });
  if (!res.ok) throw new Error(`SEP-24 withdraw ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// SEP-12: register/refresh a customer's KYC so the anchor's hosted form loads it
// pre-filled instead of blank. Best-effort — returns the HTTP status.
export async function sep12PutCustomer(token: string, fields: Record<string, string>): Promise<number> {
  const a = await resolveAnchor();
  if (!a.kyc) return 0;
  const res = await fetch(`${a.kyc}/customer`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return res.status;
}

// SEP-24: poll a transaction by id. Surfaces status and, once the user has finished the
// interactive step, withdraw_anchor_account + withdraw_memo (where the funds must be sent).
export async function sep24Transaction(token: string, id: string): Promise<any> {
  const a = await resolveAnchor();
  const res = await fetch(`${a.sep24}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`SEP-24 transaction ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { transaction } = await res.json();
  return transaction;
}

function field(toml: string, key: string): string | undefined {
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  return m?.[1];
}

function stripSlash(s: string): string {
  return s.replace(/\/$/, "");
}
