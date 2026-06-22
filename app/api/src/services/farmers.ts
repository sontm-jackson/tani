import { prisma } from "../db.js";
import { usdc } from "../stellar/client.js";
import { provisionWallet } from "./custody.js";
import { encrypt } from "../crypto.js";

// Normalize any Vietnamese phone input to +84 E.164 so a co-op-added farmer's
// number always matches what the farmer app produces at login (it strips the
// leading 0 and prepends +84). Handles local (0901…), bare (901…), and full
// (+84 90…, 8490…) formats alike.
export function toVnE164(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("84")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return "+84" + d;
}

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
