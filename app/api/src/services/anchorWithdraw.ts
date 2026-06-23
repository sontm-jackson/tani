import { prisma } from "../db.js";
import { config } from "../config.js";
import { usdc, anchorUsdc } from "../stellar/client.js";
import { payOne, payWithMemo } from "../stellar/payments.js";
import { sleep, getAssetBalance } from "../stellar/account.js";
import { decrypt } from "../crypto.js";
import { ensureAnchorTrustline } from "./custody.js";
import { sep10Authenticate, sep24WithdrawInteractive, sep24Transaction, sep12PutCustomer } from "../stellar/anchorSep.js";

// Real SEP-24 cash-out. The farmer holds our internal USDC; the anchor only settles its
// own USDC, so at cash-out we swap 1:1 (anchor USDC from the treasury to the farmer, the
// farmer's internal USDC back to the pool) and run a genuine SEP-24 interactive withdraw.
//
// The off-ramp is interactive (the farmer completes KYC in the anchor's webview), so this
// is two-phase: initiateCashOut() returns the hosted URL immediately, and a background
// poller (settleCashOut) finishes the on-chain settlement once the farmer is done.

const USDC_TO_VND = 25400;

export function maskAccount(provider?: string | null, account?: string | null): string {
  const last4 = (account ?? "").replace(/\s/g, "").slice(-4);
  return `${provider ?? "Account"} ••••${last4}`;
}

function treasuryBalance() {
  return getAssetBalance(config.treasuryPublic, config.assetCode, config.anchorUsdcIssuer);
}

// The farmer's KYC, built from what they already gave us. Registered with the anchor
// (SEP-12) before the form opens so it loads pre-filled. ID fields are dummy testnet
// values so the customer reaches ACCEPTED and the form skips asking for them.
function farmerKyc(farmer: any): Record<string, string> {
  const parts = (farmer.payoutName || farmer.name || "").trim().split(/\s+/);
  const acct = String(farmer.payoutAccount || "").replace(/\D/g, "");
  const phone = String(farmer.phone || "").replace(/\D/g, "");
  const out: Record<string, string> = {
    first_name: parts[0] || "Farmer",
    last_name: parts.slice(1).join(" ") || parts[0] || farmer.name || "Tani",
    email_address: `${phone || "farmer"}@tani.app`,
    id_type: "passport",
    id_country_code: "VN",
    id_number: "X1234567",
    id_issue_date: "2020-01-01",
    id_expiration_date: "2030-01-01",
  };
  if (acct) {
    out.bank_account_number = acct;
    out.bank_number = acct;
  }
  if (farmer.payoutProvider) out.bank_name = farmer.payoutProvider;
  return out;
}

export async function initiateCashOut(farmerId: string, amountUsdc: number) {
  const farmer = await prisma.farmer.findUnique({
    where: { id: farmerId },
    include: { wallet: true, operator: true },
  });
  if (!farmer || !farmer.wallet) throw new Error("farmer or wallet not found");
  if (amountUsdc <= 0) throw new Error("amount must be positive");
  if (amountUsdc > config.anchorMaxPerTx) {
    throw new Error(`The anchor accepts at most ${config.anchorMaxPerTx} USDC per cash-out on testnet.`);
  }
  if (!farmer.payoutAccount) {
    throw new Error("Set a payout destination (bank or mobile money) before cashing out.");
  }
  if (!config.treasurySecret) {
    throw new Error("Cash-out is not available yet (anchor treasury not set up).");
  }
  // Fail before opening the anchor window if the off-ramp can't be funded.
  if ((await treasuryBalance()) < amountUsdc) {
    throw new Error("Cash-out is temporarily unavailable — the off-ramp reserve is low. Try a smaller amount or again shortly.");
  }

  const farmerSecret = decrypt(farmer.wallet.secret);
  if (!farmer.wallet.anchorTrustline) {
    await ensureAnchorTrustline(farmerSecret);
    await prisma.wallet.update({ where: { id: farmer.wallet.id }, data: { anchorTrustline: true } });
  }

  const token = await sep10Authenticate(farmerSecret);
  // Register the farmer's KYC so the anchor's hosted form loads pre-filled (best-effort).
  const kyc = farmerKyc(farmer);
  try {
    const st = await sep12PutCustomer(token, kyc);
    console.log("sep12 prefill for", farmer.name, "->", st);
  } catch (e) {
    console.error("sep12 prefill failed", e);
  }
  const w = await sep24WithdrawInteractive(token, farmer.wallet.publicKey, amountUsdc, kyc);

  const cash = await prisma.cashOut.create({
    data: {
      farmerId,
      amountUsdc,
      amountLocal: Math.round(amountUsdc * USDC_TO_VND),
      currency: "VND",
      destType: farmer.payoutType,
      destProvider: farmer.payoutProvider,
      destMasked: maskAccount(farmer.payoutProvider, farmer.payoutAccount),
      status: "interactive",
      anchorTxId: w.id,
      interactiveUrl: w.url,
      sep10Token: token,
    },
  });

  settleCashOut(cash.id).catch((e) => console.error("settleCashOut", cash.id, e));
  return cash;
}

// Poll the anchor until the farmer finishes the interactive step, then do the swap and
// send the anchor USDC to the anchor's receiving account, then wait for completion.
export async function settleCashOut(cashOutId: string): Promise<void> {
  const cash = await prisma.cashOut.findUnique({
    where: { id: cashOutId },
    include: { farmer: { include: { wallet: true, operator: true } } },
  });
  if (!cash || !cash.anchorTxId || !cash.sep10Token) return;
  const farmer = cash.farmer;
  if (!farmer.wallet) return;

  const token = cash.sep10Token;
  const id = cash.anchorTxId;

  // 1) Wait for the farmer to finish KYC; the anchor then returns where to send funds.
  let tx: any = null;
  for (let i = 0; i < 150; i++) {
    try { tx = await sep24Transaction(token, id); } catch { /* transient */ }
    const status = tx?.status;
    if (status === "pending_user_transfer_start" || tx?.withdraw_anchor_account) break;
    if (status === "error" || status === "refunded" || status === "expired" || status === "too_late") {
      await fail(cashOutId, `anchor status ${status}`);
      return;
    }
    await sleep(4000);
  }
  if (!tx?.withdraw_anchor_account) {
    await fail(cashOutId, "Timed out waiting for the anchor (the withdraw steps weren't completed).");
    return;
  }

  // The anchor's amount is authoritative (the farmer may have set it in the webview).
  const amount = Number(tx.amount_in ?? cash.amountUsdc);
  const anchorAccount: string = tx.withdraw_anchor_account;
  const memoValue: string = tx.withdraw_memo ?? "";
  const memoType: string = tx.withdraw_memo_type ?? "text";
  const farmerSecret = decrypt(farmer.wallet.secret);

  // Pre-checks BEFORE moving any funds, so a shortfall never debits the farmer.
  if ((await treasuryBalance()) < amount) {
    await fail(cashOutId, "Off-ramp reserve is too low to complete this cash-out.");
    return;
  }
  if ((await getAssetBalance(farmer.wallet.publicKey, config.assetCode, config.assetIssuer)) < amount) {
    await fail(cashOutId, "Not enough balance to cash out this amount.");
    return;
  }

  try {
    // 2) Swap in: treasury hands the farmer the anchor USDC to withdraw.
    await payOne(config.treasurySecret, farmer.wallet.publicKey, anchorUsdc(), amount, "Tani swap");

    // 3) Withdraw: farmer sends the anchor USDC to the anchor with the required memo.
    const hash = await payWithMemo(farmerSecret, anchorAccount, anchorUsdc(), amount, memoType, memoValue);
    await prisma.cashOut.update({
      where: { id: cashOutId },
      data: {
        status: "sent",
        txHash: hash,
        amountUsdc: amount,
        amountLocal: Math.round(amount * USDC_TO_VND),
      },
    });

    // 4) Debit last: the farmer's internal USDC goes back to the pool.
    await payOne(farmerSecret, farmer.operator.poolPublicKey, usdc(), amount, "Tani cash-out");
  } catch (e: any) {
    await fail(cashOutId, settleError(e));
    return;
  }

  // 5) Wait for the anchor to confirm it paid out the local currency.
  for (let i = 0; i < 60; i++) {
    try {
      const t = await sep24Transaction(token, id);
      if (t?.status === "completed") {
        await prisma.cashOut.update({ where: { id: cashOutId }, data: { status: "success" } });
        return;
      }
      if (t?.status === "error" || t?.status === "refunded") {
        await fail(cashOutId, `anchor status ${t.status}`);
        return;
      }
    } catch { /* transient */ }
    await sleep(4000);
  }
  // Funds were sent; the anchor just hasn't flipped to completed yet. Leave as "sent".
}

async function fail(cashOutId: string, msg: string) {
  console.error("cash-out failed", cashOutId, msg);
  await prisma.cashOut
    .update({ where: { id: cashOutId }, data: { status: "failed", error: msg } })
    .catch(() => {});
}

function settleError(e: any): string {
  const codes = e?.response?.data?.extras?.result_codes;
  return codes ? JSON.stringify(codes) : e?.message ?? String(e);
}
