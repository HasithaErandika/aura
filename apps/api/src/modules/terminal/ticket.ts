import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";

// The web terminal ticket format, shared by contract with apps/agent-runtime terminal/ticket.ts
// (which verifies and decrypts). Kept free of Express/env so it can be unit-tested directly.
//
//   ticket = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, secret))
//   cli.token = base64url(iv) "." base64url(tag) "." base64url(AES-256-GCM(token))
//               with key = SHA-256("aura-terminal-cli-token:" + secret)

export interface TerminalTicketPayload {
  userId: string;
  role: string;
  epicKey: string;
  discipline: string;
  taskKey: string | null;
  exp: number;
  cli?: { apiUrl: string; token: string };
}

// Signs a ticket; a fresh random nonce makes every ticket single-use on the runtime side.
export function signTerminalTicket(payload: TerminalTicketPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

// The ticket travels through the browser (in the WebSocket URL), so the CLI token inside it is
// encrypted - only the runtime, which holds the same secret, can read it.
export function encryptForRuntime(plaintext: string, secret: string): string {
  const key = createHash("sha256").update(`aura-terminal-cli-token:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
