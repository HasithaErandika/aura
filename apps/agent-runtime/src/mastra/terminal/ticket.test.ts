import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptCliToken, verifyTicket } from './ticket';

// Contract with apps/api modules/terminal/ticket.ts: tickets are built here exactly the way the API
// signs and encrypts them.

const secret = 's'.repeat(40);

function apiSign(payload: Record<string, unknown>, key = secret): string {
  const body = Buffer.from(JSON.stringify({ nonce: randomBytes(16).toString('hex'), ...payload })).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}

function apiEncrypt(plaintext: string): string {
  const key = createHash('sha256').update(`aura-terminal-cli-token:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

const base = { userId: 'u1', role: 'developer', epicKey: 'KAN-36', discipline: 'Backend', taskKey: 'KAN-47' };

describe('verifyTicket', () => {
  it('accepts a fresh ticket signed with the shared secret', () => {
    expect(verifyTicket(apiSign({ ...base, exp: Date.now() + 60_000 }), secret)).toMatchObject(base);
  });

  it('accepts each ticket only once', () => {
    const ticket = apiSign({ ...base, exp: Date.now() + 60_000 });
    expect(verifyTicket(ticket, secret)).not.toBeNull();
    expect(verifyTicket(ticket, secret)).toBeNull();
  });

  it('rejects expired, wrongly signed and malformed tickets', () => {
    expect(verifyTicket(apiSign({ ...base, exp: Date.now() - 1 }), secret)).toBeNull();
    expect(verifyTicket(apiSign({ ...base, exp: Date.now() + 60_000 }, 'x'.repeat(40)), secret)).toBeNull();
    expect(verifyTicket('garbage', secret)).toBeNull();
    expect(verifyTicket('a.b', secret)).toBeNull();
  });
});

describe('decryptCliToken', () => {
  it('recovers the CLI token the API encrypted', () => {
    expect(decryptCliToken(apiEncrypt('aura_pat_abc'), secret)).toBe('aura_pat_abc');
  });

  it('returns null for a tampered value or another secret', () => {
    const encrypted = apiEncrypt('aura_pat_abc');
    expect(decryptCliToken(encrypted, 'o'.repeat(40))).toBeNull();
    const [iv, tag, body] = encrypted.split('.');
    expect(decryptCliToken(`${iv}.${tag}.${body}AA`, secret)).toBeNull();
    expect(decryptCliToken('not-encrypted', secret)).toBeNull();
  });
});
