import { describe, expect, it } from 'vitest';
import { redact, redactDeep } from './redact';
import { redactionBanner, redactMessages } from '../gateway/redaction';

const on = { pii: true };
const off = { pii: false };

describe('redaction before prompts (step 4.3)', () => {
  it('removes secrets and says what was there', () => {
    const text = [
      'token ghp_' + 'a'.repeat(36),
      'aws AKIAABCDEFGHIJKLMNOP',
      'groq gsk_' + 'b'.repeat(48),
      'key AIza' + 'c'.repeat(35),
      'Authorization: Bearer ' + 'd'.repeat(30),
      'pat aura_pat_' + 'e'.repeat(20),
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const { text: out, counts } = redact(text, off);
    expect(out).not.toMatch(/ghp_a|AKIAABCD|gsk_b|AIzac|dddd|aura_pat_e|dozjgN|MIIEow/);
    expect(out).toContain('Authorization: Bearer [REDACTED:bearer-token]');
    expect(counts).toMatchObject({ 'github-token': 1, 'aws-access-key': 1, 'groq-key': 1, 'google-api-key': 1, 'bearer-token': 1, 'aura-token': 1, jwt: 1, 'private-key': 1 });
  });

  it('keeps the name of a credential and of a connection string, not the value', () => {
    expect(redact('DB_PASSWORD=hunter2hunter2\napi_key: "abcd1234efgh"\nJWT_SECRET_KEY=s3cr3tvalue', off).text).toBe('DB_PASSWORD=[REDACTED:credential]\napi_key: "[REDACTED:credential]"\nJWT_SECRET_KEY=[REDACTED:credential]');
    expect(redact('postgresql://postgres.ref:S3cr3t!pw@aws-0.pooler.supabase.com:5432/postgres', off).text).toBe('postgresql://postgres.ref:[REDACTED:password]@aws-0.pooler.supabase.com:5432/postgres');
  });

  it('leaves references to secrets and ordinary text alone', () => {
    const text = 'apiKey = process.env.GROQ_API_KEY\npassword: ${DB_PASSWORD}\nThe password must be 8 characters.';
    expect(redact(text, off)).toEqual({ text, counts: {} });
  });

  it('removes personal data only when the project has it on, and keeps test addresses', () => {
    const text = 'Mail jane.doe@acme.com or +94 77 123 4567, card 4111 1111 1111 1111. Fixture: user@example.com';
    expect(redact(text, off).text).toBe(text);
    const r = redact(text, on);
    expect(r.text).toBe('Mail [REDACTED:email] or [REDACTED:phone], card [REDACTED:card-number]. Fixture: user@example.com');
    expect(r.counts).toEqual({ email: 1, 'card-number': 1, phone: 1 });
  });

  it('does not take ordinary long numbers for card numbers', () => {
    expect(redact('order 1234567890123', on).counts).toEqual({});
  });

  it('redacts every string inside a tool result and keeps its shape', () => {
    const counts: Record<string, number> = {};
    expect(redactDeep({ content: 'TOKEN=ghp_' + 'z'.repeat(36), size: 3, list: ['ok'] }, off, counts)).toEqual({ content: 'TOKEN=[REDACTED:github-token]', size: 3, list: ['ok'] });
    expect(counts).toEqual({ 'github-token': 1 });
  });

  it('redacts message text and tool results in place before the model call', () => {
    const messages = [
      { content: { parts: [{ type: 'text', text: 'my key is gsk_' + 'q'.repeat(48) }] } },
      { content: { parts: [{ type: 'tool-invocation', toolInvocation: { result: { content: 'SECRET_KEY=abcdefgh12345678' } } }] } },
    ];
    expect(redactMessages(messages, false)).toEqual({ 'groq-key': 1, 'credential-assignment': 1 });
    expect(messages[0]!.content.parts[0]).toMatchObject({ text: 'my key is [REDACTED:groq-key]' });
    expect(JSON.stringify(messages[1])).toContain('SECRET_KEY=[REDACTED:credential]');
  });

  it('tells the reviewer on the draft what was removed', () => {
    expect(redactionBanner({ 'github-token': 2, email: 1 })).toBe('> 🔒 AURA removed 2 secrets and 1 personal-data item (github-token ×2, email ×1) from the source content before the model saw it.\n');
  });
});
