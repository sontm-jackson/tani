import { prisma } from "../db.js";
import { usdc } from "../stellar/client.js";
import { payOne } from "../stellar/payments.js";
import { decrypt } from "../crypto.js";

// Simulated anchor cash-out. The farmer's USDC is sent on-chain to the operator's pool
// (acting as the anchor treasury) and recorded as a local-currency payout.
// Production swaps this for a real SEP-24 withdraw against a licensed anchor
// (the wallet SDK flow against testanchor.stellar.org is stubbed in anchor-sep24.ts).
const USDC_TO_VND = 25400;

export function maskAccount(provider?: string | null, account?: string | null): string {
  const last4 = (account ?? "").replace(/\s/g, "").slice(-4);
  return `${provider ?? "Account"} ••••${last4}`;
}

export async function cashOut(farmerId: string, amountUsdc: number) {
  const farmer = await prisma.farmer.findUnique({
    where: { id: farmerId },
    include: { wallet: true, operator: true },
  });
  if (!farmer || !farmer.wallet) throw new Error("farmer or wallet not found");
  if (amountUsdc <= 0) throw new Error("amount must be positive");
  if (!farmer.payoutAccount) {
    throw new Error("Set a payout destination (bank or mobile money) before cashing out.");
  }

  const destMasked = maskAccount(farmer.payoutProvider, farmer.payoutAccount);

  const cash = await prisma.cashOut.create({
    data: {
      farmerId,
      amountUsdc,
      amountLocal: Math.round(amountUsdc * USDC_TO_VND),
      currency: "VND",
      destType: farmer.payoutType,
      destProvider: farmer.payoutProvider,
      destMasked,
      status: "pending",
    },
  });

  try {
    const hash = await payOne(
      decrypt(farmer.wallet.secret),
      farmer.operator.poolPublicKey, // simulated anchor treasury
      usdc(),
      amountUsdc,
      "Tani cash-out"
    );
    return prisma.cashOut.update({
      where: { id: cash.id },
      data: { status: "success", txHash: hash },
    });
  } catch (e: any) {
    const codes = e?.response?.data?.extras?.result_codes;
    const msg = codes ? JSON.stringify(codes) : e?.message ?? String(e);
    await prisma.cashOut.update({ where: { id: cash.id }, data: { status: "failed" } });
    throw new Error(`cash-out failed: ${msg}`);
  }
}
