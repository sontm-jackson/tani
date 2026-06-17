import { prisma } from "../db.js";
import { usdc } from "../stellar/client.js";
import { batchPay } from "../stellar/payments.js";
import { decrypt } from "../crypto.js";
import { computePayouts } from "./rules.js";

// Orchestrate one event into an on-chain disbursement. Idempotent: an already-processed
// event returns its existing disbursement and never pays twice.
export async function processEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { disbursement: { include: { payments: true } } },
  });
  if (!event) throw new Error(`event ${eventId} not found`);

  // Idempotency guard.
  if (event.status === "processed" && event.disbursement) {
    return event.disbursement;
  }
  if (!event.lotId) throw new Error("event has no lot");

  const operator = await prisma.operator.findUnique({ where: { id: event.operatorId } });
  if (!operator) throw new Error("operator not found");

  const payouts = await computePayouts(event.operatorId, event.type, event.lotId);
  if (payouts.length === 0) throw new Error("no payouts resolved for event");

  const total = payouts.reduce((s, p) => s + p.amount, 0);

  // Create the disbursement + payment rows up front (status pending).
  const disbursement = await prisma.disbursement.create({
    data: {
      operatorId: event.operatorId,
      eventId: event.id,
      status: "submitted",
      totalAmount: total,
      payments: {
        create: payouts.map((p) => ({
          farmerId: p.farmerId,
          amount: p.amount,
          reason: p.reason,
        })),
      },
    },
    include: { payments: true },
  });

  try {
    const hash = await batchPay(
      decrypt(operator.poolSecret),
      usdc(),
      payouts.map((p) => ({ destination: p.destination, amount: p.amount })),
      `Tani ${event.type}`
    );

    const updated = await prisma.disbursement.update({
      where: { id: disbursement.id },
      data: { status: "success", txHash: hash },
      include: { payments: { include: { farmer: true } } },
    });
    await prisma.event.update({ where: { id: event.id }, data: { status: "processed" } });
    if (event.lotId) {
      await prisma.lot.update({ where: { id: event.lotId }, data: { status: "paid" } });
    }
    return updated;
  } catch (e: any) {
    const codes = e?.response?.data?.extras?.result_codes;
    const msg = codes ? JSON.stringify(codes) : e?.message ?? String(e);
    await prisma.disbursement.update({
      where: { id: disbursement.id },
      data: { status: "failed", error: msg },
    });
    await prisma.event.update({ where: { id: event.id }, data: { status: "failed" } });
    throw new Error(`disbursement failed: ${msg}`);
  }
}
