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
