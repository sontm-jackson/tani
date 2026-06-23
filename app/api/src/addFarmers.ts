// Add a small roster of test farmers on the Firebase test numbers (+8412345678X),
// each with a custodial wallet (internal + anchor trustlines), an approved location,
// and a short story. Login on the farmer app with the 9-digit number + code 123456.
// Idempotent: skips numbers that already exist. Run: npm run add:farmers
import { prisma } from "./db.js";
import { usdc } from "./stellar/client.js";
import { provisionWallet } from "./services/custody.js";
import { encrypt } from "./crypto.js";

const FARMERS = [
  { phone: "+84123456781", name: "Nguyễn Văn An", village: "Di Linh", lat: 11.575, lng: 108.068, farmSizeHa: 1.2, yearsFarming: 18, bio: "Third-generation coffee grower on a 1.2 ha plot." },
  { phone: "+84123456782", name: "Trần Thị Bình", village: "Bảo Lộc", lat: 11.548, lng: 107.812, farmSizeHa: 0.8, yearsFarming: 12, bio: "Switched to washed Arabica for the export premium." },
  { phone: "+84123456783", name: "Lê Văn Cường", village: "Cầu Đất", lat: 11.805, lng: 108.552, farmSizeHa: 2.5, yearsFarming: 22, bio: "Grows Robusta at altitude; co-op member since 2015." },
  { phone: "+84123456784", name: "Phạm Thị Dung", village: "Đức Trọng", lat: 11.752, lng: 108.402, farmSizeHa: 0.6, yearsFarming: 9, bio: "Young farmer focused on organic certification." },
  { phone: "+84123456785", name: "Hoàng Văn Em", village: "Lạc Dương", lat: 12.048, lng: 108.435, farmSizeHa: 1.5, yearsFarming: 15, bio: "High-altitude specialty coffee near Lạc Dương." },
  { phone: "+84123456786", name: "Vũ Thị Hoa", village: "Di Linh", lat: 11.582, lng: 108.079, farmSizeHa: 0.4, yearsFarming: 7, bio: "Small plot, sells to the co-op each harvest." },
];

async function main() {
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator — run `npm run seed` first");

  console.log(`Adding ${FARMERS.length} farmers to ${op.name}...`);
  for (const f of FARMERS) {
    const existing = await prisma.farmer.findUnique({ where: { phone: f.phone } });
    if (existing) {
      console.log(`  ${f.phone}  skip (already exists)`);
      continue;
    }
    process.stdout.write(`  ${f.name} (${f.phone})... `);
    const kp = await provisionWallet(usdc());
    await prisma.farmer.create({
      data: {
        operatorId: op.id,
        name: f.name,
        phone: f.phone,
        village: f.village,
        status: "active",
        lat: f.lat,
        lng: f.lng,
        farmSizeHa: f.farmSizeHa,
        yearsFarming: f.yearsFarming,
        bio: f.bio,
        wallet: {
          create: {
            publicKey: kp.publicKey,
            secret: encrypt(kp.secret),
            trustline: true,
            anchorTrustline: kp.anchorTrustline,
          },
        },
      },
    });
    console.log("ok");
  }
  console.log("\nDone. Log in on the farmer app with the 9-digit number + code 123456.");
  console.log("Numbers 123456787 / 788 / 789 are left free for you to add by hand.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nadd:farmers failed:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
