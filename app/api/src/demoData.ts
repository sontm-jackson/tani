// Make the current data screenshot-ready without a full reseed: backfill farm sizes
// and ensure a couple of declared deliveries exist so Arrivals isn't empty.
// Run: npx tsx src/demoData.ts
import { prisma } from "./db.js";
import { newQrToken } from "./services/shipments.js";

const SIZES = [1.2, 0.8, 2.5, 0.6, 1.5, 0.4, 2.0, 0.9];

async function main() {
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator — run `npm run seed`");

  const farmers = await prisma.farmer.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  let sized = 0;
  for (let i = 0; i < farmers.length; i++) {
    if (farmers[i].farmSizeHa == null) {
      await prisma.farmer.update({ where: { id: farmers[i].id }, data: { farmSizeHa: SIZES[i % SIZES.length] } });
      sized++;
    }
  }

  const declared = await prisma.shipment.count({ where: { status: "declared" } });
  const demo = [
    { variety: "Arabica Catimor", claimedKg: 240, grade: "Grade 1 / Screen 16", processing: "Washed", moisture: 12.0, certification: "Organic", harvestDate: "2026-06-15" },
    { variety: "Robusta", claimedKg: 320, grade: "Grade 2 / Screen 13", processing: "Natural", moisture: 12.5, certification: "Rainforest Alliance", harvestDate: "2026-06-18" },
  ];
  let made = 0;
  for (let i = 0; i < demo.length && declared + made < 2 && i < farmers.length; i++) {
    await prisma.shipment.create({
      data: { operatorId: op.id, farmerId: farmers[i].id, qrToken: newQrToken(), commodity: "coffee", status: "declared", ...demo[i] },
    });
    made++;
  }

  console.log(`Demo data ready: backfilled ${sized} farm sizes, created ${made} declared deliveries (${declared} already existed).`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
