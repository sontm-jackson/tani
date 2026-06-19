import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { usdc } from "../stellar/client.js";
import { batchPay } from "../stellar/payments.js";
import { decrypt } from "../crypto.js";

export function newQrToken(): string {
  return "TANI-" + randomBytes(9).toString("hex").toUpperCase();
}

export interface VerifyInput {
  verifiedKg?: number; // adjusted weight (defaults to claimed)
  discrepancies?: string[]; // fields the operator adjusted/flagged
  note?: string;
  accept: boolean; // adjust-and-pay (true) or reject (false)
}

// Operator verifies a scanned shipment against the farmer's declaration, then pays
// on the verified weight (adjust-and-pay) or rejects with a reason.
export async function verifyAndPay(shipmentId: string, input: VerifyInput) {
  const s = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { farmer: { include: { wallet: true } }, operator: true },
  });
  if (!s) throw new Error("shipment not found");
  if (s.status === "paid") throw new Error("shipment already paid");
  if (!s.farmer.wallet) throw new Error("farmer has no wallet");
  if (input.accept && s.farmer.status !== "active") {
    throw new Error("This farmer is pending — approve them in Farmers before paying.");
  }

  const discJson = input.discrepancies?.length ? JSON.stringify(input.discrepancies) : null;

  if (!input.accept) {
    return prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: "rejected", note: input.note ?? "rejected on inspection", discrepancies: discJson, verifiedAt: new Date() },
    });
  }

  const verifiedKg = input.verifiedKg ?? s.claimedKg;
  const rule = await prisma.rule.findFirst({
    where: { operatorId: s.operatorId, commodity: s.commodity, active: true },
  });
  if (!rule) throw new Error(`no active rule for commodity "${s.commodity}"`);
  const amount = Math.round(verifiedKg * rule.ratePerKg * 1e7) / 1e7;

  const hash = await batchPay(
    decrypt(s.operator.poolSecret),
    usdc(),
    [{ destination: s.farmer.wallet.publicKey, amount }],
    "Tani shipment"
  );

  return prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: "paid",
      verifiedKg,
      amountPaid: amount,
      paymentTxHash: hash,
      discrepancies: discJson,
      note: input.note ?? null,
      verifiedAt: new Date(),
    },
  });
}
