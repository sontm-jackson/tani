// Seed the demo: a Central Highlands (Lâm Đồng) cooperative on Stellar testnet.
// Two verticals (coffee + rice) prove the engine is commodity-agnostic.
// Creates issuer + pool + farmers + lots + rules, encrypts secrets, writes keys to .env.
// Run: npm run seed   (provisions real testnet accounts — takes ~1-2 minutes)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Asset } from "@stellar/stellar-sdk";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { encrypt, ensureEncryptionKey, hashPassword } from "./crypto.js";
import { createKeypair, fundWithFriendbot, setTrustline, getAssetBalance, sleep } from "./stellar/account.js";
import { issueAsset } from "./stellar/payments.js";
import { provisionWallet } from "./services/custody.js";
import { newQrToken } from "./services/shipments.js";

const FARMERS = [
  { name: "Nguyễn Văn An", village: "Di Linh", phone: "+84901000001", coffee: 240, rice: 1200, lat: 11.575, lng: 108.068, household: "Family of 5", yearsFarming: 18, bio: "Third-generation coffee grower on a 1.2 ha plot." },
  { name: "Trần Thị Bình", village: "Bảo Lộc", phone: "+84901000002", coffee: 180, rice: 0, lat: 11.548, lng: 107.812, household: "Family of 4", yearsFarming: 12, bio: "Switched to washed Arabica for the export premium." },
  { name: "Lê Văn Cường", village: "Cầu Đất", phone: "+84901000003", coffee: 320, rice: 2400, lat: 11.805, lng: 108.552, household: "Family of 6", yearsFarming: 22, bio: "Grows Robusta and rice; co-op member since 2015." },
  { name: "Phạm Thị Dung", village: "Đức Trọng", phone: "+84901000004", coffee: 150, rice: 1800, lat: 11.752, lng: 108.402, household: "Family of 3", yearsFarming: 9, bio: "Young farmer focused on organic certification." },
  { name: "Hoàng Văn Em", village: "Lạc Dương", phone: "+84901000005", coffee: 200, rice: 0, lat: 12.048, lng: 108.435, household: "Family of 5", yearsFarming: 15, bio: "High-altitude specialty coffee near Lạc Dương." },
  { name: "Vũ Thị Hoa", village: "Di Linh", phone: "+84901000006", coffee: 90, rice: 900, lat: 11.582, lng: 108.079, household: "Family of 4", yearsFarming: 7, bio: "Small plot, sells to the co-op each harvest." },
  { name: "Đặng Văn Giang", village: "Cầu Đất", phone: "+84901000007", coffee: 275, rice: 0, lat: 11.813, lng: 108.560, household: "Family of 7", yearsFarming: 25, bio: "Honey-processed beans, Fairtrade certified." },
  { name: "Bùi Thị Hạnh", village: "Bảo Lộc", phone: "+84901000008", coffee: 130, rice: 1500, lat: 11.556, lng: 107.821, household: "Family of 4", yearsFarming: 11, bio: "Coffee and rice on a family plot in Bảo Lộc." },
];

function updateEnv(updates: Record<string, string>) {
  const path = ".env";
  let lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (idx >= 0) lines[idx] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  writeFileSync(path, lines.join("\n"));
}

async function main() {
  console.log("Seeding Tani demo on Stellar testnet...\n");
  ensureEncryptionKey();

  console.log("Clearing existing data...");
  await prisma.shipment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.cashOut.deleteMany();
  await prisma.disbursement.deleteMany();
  await prisma.event.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.farmer.deleteMany();
  await prisma.operator.deleteMany();

  // 1. Issuer
  console.log("1. Creating USDC issuer...");
  const issuer = createKeypair();
  await fundWithFriendbot(issuer.publicKey);
  config.assetIssuer = issuer.publicKey;
  config.issuerSecret = issuer.secret;
  updateEnv({ ASSET_ISSUER: issuer.publicKey, ISSUER_SECRET: issuer.secret });
  const USDC = new Asset(config.assetCode, issuer.publicKey);

  // 2. Operator pool account
  console.log("2. Creating cooperative pool account...");
  const pool = createKeypair();
  await fundWithFriendbot(pool.publicKey);
  await sleep(300);
  await setTrustline(pool.secret, USDC);
  console.log("   minting 5000 USDC into the pool...");
  await issueAsset(issuer.secret, pool.publicKey, USDC, 5000);

  const operator = await prisma.operator.create({
    data: {
      name: "Lâm Đồng Coffee Cooperative",
      region: "Central Highlands, Vietnam",
      email: "coop@tani.app",
      passwordHash: hashPassword("tani1234"),
      poolPublicKey: pool.publicKey,
      poolSecret: encrypt(pool.secret),
    },
  });

  // 3. Farmers (custodial wallets)
  console.log(`3. Provisioning ${FARMERS.length} farmer wallets...`);
  const byPhone: Record<string, string> = {};
  for (const f of FARMERS) {
    process.stdout.write(`   ${f.name}... `);
    const kp = await provisionWallet(USDC);
    const farmer = await prisma.farmer.create({
      data: {
        operatorId: operator.id,
        name: f.name,
        phone: f.phone,
        village: f.village,
        lat: f.lat,
        lng: f.lng,
        bio: f.bio,
        household: f.household,
        yearsFarming: f.yearsFarming,
        wallet: { create: { publicKey: kp.publicKey, secret: encrypt(kp.secret), trustline: true } },
      },
    });
    byPhone[f.phone] = farmer.id;
    console.log("ok");
    await sleep(300);
  }

  // 3b. One self-registered (pending) farmer to demo the approval flow
  console.log("   + 1 pending (self-registered) farmer...");
  {
    const kp = await provisionWallet(USDC);
    await prisma.farmer.create({
      data: {
        operatorId: operator.id,
        name: "Lê Thị Mới",
        phone: "+84905555000",
        village: "Bảo Lộc",
        status: "pending",
        wallet: { create: { publicKey: kp.publicKey, secret: encrypt(kp.secret), trustline: true } },
      },
    });
  }

  // 4. Vertical A — coffee
  console.log("4. Coffee vertical: rule (0.5 USDC/kg) + lot LOT-2026-001...");
  await prisma.rule.create({
    data: { operatorId: operator.id, name: "Coffee verified payout", eventType: "lot.verified", commodity: "coffee", ratePerKg: 0.5 },
  });
  await prisma.lot.create({
    data: {
      operatorId: operator.id,
      code: "LOT-2026-001",
      commodity: "coffee",
      contributions: {
        create: FARMERS.filter((f) => f.coffee > 0).map((f) => ({ farmerId: byPhone[f.phone], quantityKg: f.coffee })),
      },
    },
  });

  // 5. Vertical B — rice (same engine, different template) proves commodity-agnostic
  console.log("5. Rice vertical: rule (0.08 USDC/kg) + lot LOT-RICE-001...");
  await prisma.rule.create({
    data: { operatorId: operator.id, name: "Rice verified payout", eventType: "lot.verified", commodity: "rice", ratePerKg: 0.08 },
  });
  await prisma.lot.create({
    data: {
      operatorId: operator.id,
      code: "LOT-RICE-001",
      commodity: "rice",
      contributions: {
        create: FARMERS.filter((f) => f.rice > 0).map((f) => ({ farmerId: byPhone[f.phone], quantityKg: f.rice })),
      },
    },
  });

  // 6. Pending shipments (declared by farmers, in transit, awaiting scan on arrival)
  console.log("6. Creating 3 pending shipments (QR declared, awaiting arrival)...");
  const ships = [
    { phone: "+84901000001", variety: "Arabica Catimor", claimedKg: 240, grade: "Grade 1 / Screen 16", processing: "Washed", moisture: 12.0, certification: "Organic", harvestDate: "2026-05-28" },
    { phone: "+84901000003", variety: "Robusta", claimedKg: 320, grade: "Grade 2 / Screen 13", processing: "Natural", moisture: 12.5, certification: "Rainforest Alliance", harvestDate: "2026-05-30" },
    { phone: "+84901000007", variety: "Arabica Bourbon", claimedKg: 275, grade: "Specialty / Screen 18", processing: "Honey", moisture: 11.5, certification: "Fairtrade", harvestDate: "2026-06-02" },
  ];
  for (const sh of ships) {
    const { phone, ...decl } = sh;
    await prisma.shipment.create({
      data: { operatorId: operator.id, farmerId: byPhone[phone], qrToken: newQrToken(), commodity: "coffee", ...decl, status: "declared" },
    });
  }

  const poolBal = await getAssetBalance(pool.publicKey, config.assetCode);
  const coffeeKg = FARMERS.reduce((s, f) => s + f.coffee, 0);
  const riceKg = FARMERS.reduce((s, f) => s + f.rice, 0);
  console.log("\nSeed complete.");
  console.log(`  Operator : ${operator.name}`);
  console.log(`  Login    : coop@tani.app  /  tani1234   (cooperative dashboard)`);
  console.log(`  Pool     : ${poolBal} USDC`);
  console.log(`  Farmers  : ${FARMERS.length} active + 1 pending (secrets encrypted at rest)`);
  console.log(`  Coffee   : LOT-2026-001 · ${coffeeKg}kg · pays ${coffeeKg * 0.5} USDC`);
  console.log(`  Rice     : LOT-RICE-001 · ${riceKg}kg · pays ${(riceKg * 0.08).toFixed(2)} USDC`);
  console.log("\nStart the API (npm run dev), then verify a lot from the dashboard.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nSeed failed:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
