import { prisma } from "../db.js";
import { usdc } from "../stellar/client.js";
import { provisionWallet } from "./custody.js";
import { encrypt } from "../crypto.js";

// Create a farmer with a custodial wallet. Shared by operator-onboarding and self-registration.
export async function provisionFarmer(
  operatorId: string,
  data: { name: string; phone: string; village?: string },
  status: "active" | "pending" = "active"
) {
  const existing = await prisma.farmer.findUnique({ where: { phone: data.phone } });
  if (existing) throw new Error("This phone is already registered. Just sign in.");
  const kp = await provisionWallet(usdc());
  return prisma.farmer.create({
    data: {
      operatorId,
      name: data.name,
      phone: data.phone,
      village: data.village,
      status,
      wallet: { create: { publicKey: kp.publicKey, secret: encrypt(kp.secret), trustline: true } },
    },
  });
}
