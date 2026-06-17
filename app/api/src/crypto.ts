import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
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

// Ensure an ENCRYPTION_KEY exists in .env (called by seed). Returns the key hex.
export function ensureEncryptionKey(): string {
  if ((process.env.ENCRYPTION_KEY ?? "").length === 64) return process.env.ENCRYPTION_KEY!;
  const k = randomBytes(32).toString("hex");
  const path = ".env";
  let lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => l.startsWith("ENCRYPTION_KEY="));
  if (idx >= 0) lines[idx] = `ENCRYPTION_KEY=${k}`;
  else lines.push(`ENCRYPTION_KEY=${k}`);
  writeFileSync(path, lines.join("\n"));
  process.env.ENCRYPTION_KEY = k;
  return k;
}
