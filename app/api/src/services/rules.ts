import { prisma } from "../db.js";

export interface ResolvedPayout {
  farmerId: string;
  farmerName: string;
  destination: string; // farmer wallet public key
  amount: number;
  reason: string;
}

// The heart of Tani: turn a verified event into a concrete list of payouts.
// Commodity-agnostic — it reads the lot's contributions and the operator's rule.
export async function computePayouts(
  operatorId: string,
  eventType: string,
  lotId: string
): Promise<ResolvedPayout[]> {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { contributions: { include: { farmer: { include: { wallet: true } } } } },
  });
  if (!lot) throw new Error(`lot ${lotId} not found`);

  const rule = await prisma.rule.findFirst({
    where: { operatorId, eventType, commodity: lot.commodity, active: true },
  });
  if (!rule) {
    throw new Error(
      `no active rule for event "${eventType}" / commodity "${lot.commodity}"`
    );
  }

  const payouts: ResolvedPayout[] = [];
  for (const c of lot.contributions) {
    if (!c.farmer.wallet) {
      throw new Error(`farmer ${c.farmer.name} has no wallet`);
    }
    const amount = round7(c.quantityKg * rule.ratePerKg);
    payouts.push({
      farmerId: c.farmerId,
      farmerName: c.farmer.name,
      destination: c.farmer.wallet.publicKey,
      amount,
      reason: `Lot ${lot.code} verified · ${c.quantityKg}kg × ${rule.ratePerKg} ${
        process.env.ASSET_CODE ?? "USDC"
      }`,
    });
  }
  return payouts;
}

function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}
