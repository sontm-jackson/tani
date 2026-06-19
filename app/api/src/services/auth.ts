import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { prisma } from "../db.js";
import { config, smsConfigured } from "../config.js";
import { sha256, ensureJwtSecret, verifyPassword } from "../crypto.js";
import { sendSms } from "./sms.js";

const MAX_ATTEMPTS = 5;

// Request a one-time code for a phone (used by both login and self-registration).
export async function requestOtp(phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000);

  // one active code per phone
  await prisma.otpCode.deleteMany({ where: { phone } });
  await prisma.otpCode.create({ data: { phone, codeHash: sha256(code), expiresAt } });

  await sendSms(phone, `Your Tani code is ${code}. It expires in ${config.otpTtlMinutes} minutes.`);

  // In dev (no SMS provider) we return the code so it can be entered for testing.
  return { sent: true, devCode: smsConfigured ? undefined : code };
}

// Validate a code (and consume it). Throws on failure. Does not require a farmer.
export async function consumeOtp(phone: string, code: string) {
  const otp = await prisma.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
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
  await prisma.otpCode.delete({ where: { id: otp.id } });
}

// Verify a code and issue a session token (for an existing farmer).
export async function verifyOtp(phone: string, code: string) {
  await consumeOtp(phone, code);
  return issueSessionForPhone(phone);
}

// Issue a session for a phone that has been proven (by our OTP or Firebase).
export async function issueSessionForPhone(phone: string) {
  const farmer = await prisma.farmer.findUnique({ where: { phone } });
  if (!farmer) throw new Error("No account for this phone yet. Tap “Create an account”.");
  const token = jwt.sign({ sub: farmer.id, role: "farmer" }, ensureJwtSecret(), { expiresIn: "30d" });
  return { token, farmerId: farmer.id };
}

// Cooperative staff login (email + password) → operator session token.
export async function operatorLogin(email: string, password: string) {
  const op = await prisma.operator.findUnique({ where: { email } });
  if (!op || !op.passwordHash || !verifyPassword(password, op.passwordHash)) {
    throw new Error("Invalid email or password.");
  }
  const token = jwt.sign({ sub: op.id, role: "operator" }, ensureJwtSecret(), { expiresIn: "7d" });
  return { token, name: op.name };
}

// Resolve a bearer token to a farmer id (rejects operator tokens). Null if invalid.
export function farmerIdFromToken(authHeader?: string): string | null {
  const p = decodeToken(authHeader);
  return p && p.role !== "operator" ? p.sub ?? null : null;
}

// Resolve a bearer token to an operator id. Null unless it's an operator token.
export function operatorIdFromToken(authHeader?: string): string | null {
  const p = decodeToken(authHeader);
  return p && p.role === "operator" ? p.sub ?? null : null;
}

function decodeToken(authHeader?: string): { sub?: string; role?: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(authHeader.slice(7), ensureJwtSecret()) as { sub?: string; role?: string };
  } catch {
    return null;
  }
}
