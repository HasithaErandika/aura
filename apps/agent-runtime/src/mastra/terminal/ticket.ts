import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Terminal tickets are minted by apps/api (modules/terminal/terminal.router.ts) after it has
// checked the caller's role and written the audit record, then presented by the browser when it
// opens the terminal WebSocket here. Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// with TERMINAL_TICKET_SECRET, shared by the two processes. Short-lived and single-use.

export interface TerminalTicket {
  userId: string;
  role: string;
  epicKey: string;
  discipline: string;
  taskKey: string | null;
  exp: number; // epoch ms
  nonce: string;
  // Signs the `aura` CLI inside the shell in as the ticket's user without `aura login`: the API
  // URL, and a short-lived access token encrypted for this process (decryptCliToken).
  cli?: { apiUrl: string; token: string };
}

const usedNonces = new Map<string, number>();

function forgetExpired(now: number) {
  for (const [nonce, exp] of usedNonces) if (exp < now) usedNonces.delete(nonce);
}

export function verifyTicket(raw: string, secret: string): TerminalTicket | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let ticket: TerminalTicket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TerminalTicket;
  } catch {
    return null;
  }
  const now = Date.now();
  forgetExpired(now);
  if (typeof ticket.exp !== 'number' || ticket.exp < now || !ticket.nonce || usedNonces.has(ticket.nonce)) return null;
  usedNonces.set(ticket.nonce, ticket.exp);
  return ticket;
}

// Reverses apps/api terminal.router.ts encryptForRuntime (AES-256-GCM, key derived from the
// shared secret). Null if it was tampered with or the secrets differ.
export function decryptCliToken(encrypted: string, secret: string): string | null {
  try {
    const [iv, tag, body] = encrypted.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !body) return null;
    const key = createHash('sha256').update(`aura-terminal-cli-token:${secret}`).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
