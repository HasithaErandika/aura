import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// AES-256-GCM at-rest encryption for user-supplied secrets (coding-agent API keys - see
// modules/credentials). A random IV per call, output as "iv:authTag:ciphertext" (base64,
// colon-joined) so decryption is self-contained from the stored string alone. The key never
// touches the database - it lives only in CREDENTIALS_ENCRYPTION_KEY, set by whoever operates
// this deployment, not by AURA itself.

const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  const buf = Buffer.from(env.credentialsEncryptionKey, "base64");
  if (buf.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes - generate one with `openssl rand -base64 32`");
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

// A short, non-reversible preview for the UI ("sk-ant-...9f3a") - never enough to reconstruct
// the key, just enough for a human to recognize which one they connected.
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "••••";
  return `${plaintext.slice(0, 6)}…${plaintext.slice(-4)}`;
}
