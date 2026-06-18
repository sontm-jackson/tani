import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { prisma } from "../db.js";
import { config, smsConfigured } from "../config.js";
import { sha256, ensureJwtSecret } from "../crypto.js";
import { sendSms } from "./sms.js";

const MAX_ATTEMPTS = 5;

// Request a one-time code for a phone. The phone must belong to a farmer the
// cooperative has onboarded (farmers don't self-provision wallets).
export async function requestOtp(phone: string) {
  const farmer = await prisma.farmer.findUnique({ where: { phone } });
  if (!farmer) {
    throw new Error("This phone isn't registered. Ask your cooperative to add you.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000);

  // one active code per phone
  await prisma.otpCode.deleteMany({ where: { phone } });
  await prisma.otpCode.create({ data: { phone, codeHash: sha256(code), expiresAt } });

  await sendSms(phone, `Your Tani code is ${code}. It expires in ${config.otpTtlMinutes} minutes.`);

  // In dev (no SMS provider) we return the code so it can be entered for testing.
  return { sent: true, devCode: smsConfigured ? undefined : code };
}

// Verify a code and issue a session token (JWT).
export async function verifyOtp(phone: string, code: string) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new Error("No code requested for this phone. Request one first.");
  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.delete({ where: { id: otp.id } });
    throw new Error("Code expired. Request a new one.");
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.delete({ where: { id: otp.id } });
    throw new Error("Too many attempts. Request a new code.");
  }
  if (otp.codeHash !== sha256(code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    throw new Error("Incorrect code.");
  }

  const farmer = await prisma.farmer.findUnique({ where: { phone } });
  if (!farmer) throw new Error("Farmer not found.");

  await prisma.otpCode.delete({ where: { id: otp.id } });
  const token = jwt.sign({ sub: farmer.id }, ensureJwtSecret(), { expiresIn: "30d" });
  return { token, farmerId: farmer.id };
}

// Resolve a bearer token to a farmer id. Returns null if missing/invalid.
export function farmerIdFromToken(authHeader?: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), ensureJwtSecret()) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
