// Reversible encryption for invite codes so the owner can copy an unused code again.
// Lookups still use the HMAC; this is only for display in /admin.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function displayKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("invite-display-key").digest();
}

export function encryptInviteCodeWith(code: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", displayKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptInviteCodeWith(payload: string | null, secret: string): string | null {
  if (!payload) return null;
  try {
    const data = Buffer.from(payload, "base64");
    const decipher = createDecipheriv("aes-256-gcm", displayKey(secret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
