import {
  Keypair,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Asset,
  Memo,
} from "@stellar/stellar-sdk";
import { horizon } from "./client.js";
import { networkPassphrase } from "../config.js";

// Stellar amounts use up to 7 decimals; send as strings.
export function fmt(amount: number): string {
  return amount.toFixed(7);
}

// Turn a stellar-sdk / Horizon submit error into a human-readable message, so the
// operator/farmer never sees raw result_codes JSON or "Request failed with status code 400".
export function stellarError(e: any): string {
  const codes = e?.response?.data?.extras?.result_codes;
  if (codes) {
    const ops: string[] = Array.isArray(codes.operations) ? codes.operations : [];
    if (ops.includes("op_underfunded")) return "the paying account doesn't have enough balance";
    if (ops.includes("op_no_trust")) return "the recipient hasn't opened a trustline for this asset yet";
    if (ops.includes("op_no_destination")) return "the recipient account isn't active on the network yet";
    if (ops.includes("op_line_full")) return "the recipient's balance limit is full";
    const detail = ops.filter((c) => c && c !== "op_success").join(", ") || codes.transaction || "transaction failed";
    return `the payment was rejected (${detail})`;
  }
  return e?.message ?? String(e);
}

export interface PayoutInstruction {
  destination: string;
  amount: number;
}

// Issue asset from the issuer account to a destination (issuer pays = mints).
export async function issueAsset(
  issuerSecret: string,
  destination: string,
  asset: Asset,
  amount: number
): Promise<string> {
  const issuer = Keypair.fromSecret(issuerSecret);
  const account = await horizon.loadAccount(issuer.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(
      Operation.payment({ destination, asset, amount: fmt(amount) })
    )
    .setTimeout(60)
    .build();
  tx.sign(issuer);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

// Batch payment: one transaction, one payment operation per recipient, from the pool account.
// This is the core disbursement primitive — up to 100 recipients per transaction on Stellar.
export async function batchPay(
  sourceSecret: string,
  asset: Asset,
  payouts: PayoutInstruction[],
  memo?: string
): Promise<string> {
  if (payouts.length === 0) throw new Error("no payouts");
  if (payouts.length > 100) throw new Error("max 100 payments per transaction");

  const source = Keypair.fromSecret(sourceSecret);
  const account = await horizon.loadAccount(source.publicKey());
  let builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase });

  for (const p of payouts) {
    builder = builder.addOperation(
      Operation.payment({ destination: p.destination, asset, amount: fmt(p.amount) })
    );
  }
  if (memo) builder = builder.addMemo(Memo.text(memo.slice(0, 28)));

  const tx = builder.setTimeout(120).build();
  tx.sign(source);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

// Simple single payment (used for cash-out transfer to the anchor account).
export async function payOne(
  sourceSecret: string,
  destination: string,
  asset: Asset,
  amount: number,
  memo?: string
): Promise<string> {
  return batchPay(sourceSecret, asset, [{ destination, amount }], memo);
}

// Payment carrying a typed memo. SEP-24 tells us where to send the withdrawal and
// which memo to attach (text | id | hash); the anchor matches the deposit by it.
export async function payWithMemo(
  sourceSecret: string,
  destination: string,
  asset: Asset,
  amount: number,
  memoType: string,
  memoValue: string
): Promise<string> {
  const source = Keypair.fromSecret(sourceSecret);
  const account = await horizon.loadAccount(source.publicKey());
  let memo: Memo;
  if (memoType === "hash") memo = Memo.hash(Buffer.from(memoValue, "base64"));
  else if (memoType === "id") memo = Memo.id(memoValue);
  else memo = Memo.text(memoValue);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.payment({ destination, asset, amount: fmt(amount) }))
    .addMemo(memo)
    .setTimeout(120)
    .build();
  tx.sign(source);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}
