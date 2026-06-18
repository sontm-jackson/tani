import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// AES-256-GCM encryption for secrets at rest (custodial keys, pool secret).
// Key lives in .env (ENCRYPTION_KEY). Testnet demo grade — production would use a KMS/HSM.

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY missing/invalid — run `npm run seed` to generate it");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

// Ensure a generated secret exists in .env; create + persist it if missing.
function ensureEnvSecret(key: string, bytes: number): string {
  const existing = process.env[key] ?? "";
  if (existing.length >= bytes * 2) return existing;
  const v = randomBytes(bytes).toString("hex");
  const path = ".env";
  let lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${v}`;
  else lines.push(`${key}=${v}`);
  writeFileSync(path, lines.join("\n"));
  process.env[key] = v;
  return v;
}

export function ensureEncryptionKey(): string {
  return ensureEnvSecret("ENCRYPTION_KEY", 32);
}

export function ensureJwtSecret(): string {
  return ensureEnvSecret("JWT_SECRET", 32);
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
