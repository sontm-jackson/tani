// Wipe demo CONTENT (farmers, lots, shipments, payments) while keeping the
// infrastructure you sign into: the cooperative account, its pool + treasury
// (on-chain balances are untouched), and the payout rules. Leaves an empty farmer
// roster so you can add your first real farmer from the co-op app.
// Run: npm run clean
import { prisma } from "./db.js";

async function main() {
  await prisma.shipment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.cashOut.deleteMany();
  await prisma.disbursement.deleteMany();
  await prisma.event.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.farmer.deleteMany();

  const op = await prisma.operator.findFirst();
  const rules = await prisma.rule.count();
  console.log("Cleaned. Removed all farmers, lots, shipments, payments, cash-outs.");
  console.log(`Kept: operator "${op?.name ?? "—"}" (login coop@tani.app / tani1234), pool, treasury, ${rules} rule(s).`);
  console.log("Add your first farmer from the co-op app → Farmers → Add farmer.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("clean failed:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
