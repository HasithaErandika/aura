// Redaction before every prompt (roadmap step 4.3). Secrets are always removed; personal data
// (emails, phone numbers, card numbers) per the project's setting. Deterministic: no model ever
// sees the text first. A redacted value is replaced with a label naming what was there, so the
// model still understands the text, and the value never leaves AURA.

export type RedactionKind = 'secret' | 'pii';

interface Rule {
  id: string;
  kind: RedactionKind;
  pattern: RegExp;
  // Replaces the whole match by default; `keep` keeps a prefix group (e.g. the variable name).
  replace?: (match: string, ...groups: string[]) => string | null;
}

const label = (id: string) => `[REDACTED:${id}]`;

// Email domains reserved for documentation and tests (RFC 2606, RFC 6761) stay readable: code and
// fixtures use them, and redacting them would make agents write labels into source files.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|local)$/i;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const RULES: Rule[] = [
  { id: 'private-key', kind: 'secret', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { id: 'aws-access-key', kind: 'secret', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', kind: 'secret', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: 'gitlab-token', kind: 'secret', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', kind: 'secret', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'stripe-key', kind: 'secret', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'google-api-key', kind: 'secret', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'anthropic-key', kind: 'secret', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'openai-key', kind: 'secret', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { id: 'groq-key', kind: 'secret', pattern: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { id: 'aura-token', kind: 'secret', pattern: /\baura_pat_[A-Za-z0-9_-]{16,}\b/g },
  { id: 'jwt', kind: 'secret', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { id: 'bearer-token', kind: 'secret', pattern: /\b(Bearer\s+)([A-Za-z0-9._~+/-]{20,}=*)/g, replace: (_m, prefix) => `${prefix}${label('bearer-token')}` },
  // user:password@ in a connection string or URL: the password goes, the rest stays.
  { id: 'url-password', kind: 'secret', pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{3,})(@)/gi, replace: (_m, head, _pw, at) => `${head}${label('password')}${at}` },
  // PASSWORD=..., api_key: "...", "client_secret": "..." – the name stays, the value goes.
  {
    id: 'credential-assignment',
    kind: 'secret',
    pattern: /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?)([^\s"',;]{8,})/gi,
    replace: (_m, head, value) => (/^\[REDACTED:/.test(value) || /^(?:\$\{|<|process\.env|env\.|os\.environ)/.test(value) ? null : `${head}${label('credential')}`),
  },
  {
    id: 'email',
    kind: 'pii',
    pattern: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g,
    replace: (_m, domain) => (RESERVED_DOMAIN.test(domain) ? null : label('email')),
  },
  {
    id: 'card-number',
    kind: 'pii',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? label('card-number') : null;
    },
  },
  { id: 'phone', kind: 'pii', pattern: /(?<![\w.])\+\d{1,3}[ .-]?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){2,3}\b/g },
];

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
}

export function redact(text: string, options: { pii: boolean }): RedactionResult {
  const counts: Record<string, number> = {};
  let out = text;
  for (const rule of RULES) {
    if (rule.kind === 'pii' && !options.pii) continue;
    out = out.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      const groups = rest.filter((g): g is string => typeof g === 'string');
      const replaced = rule.replace ? rule.replace(match, ...groups) : label(rule.id);
      if (replaced === null) return match;
      counts[rule.id] = (counts[rule.id] ?? 0) + 1;
      return replaced;
    });
  }
  return { text: out, counts };
}

export const kindOf = (ruleId: string): RedactionKind => RULES.find((r) => r.id === ruleId)?.kind ?? 'secret';

// Redacts every string inside a JSON-like value (a tool result), keeping its shape.
export function redactDeep(value: unknown, options: { pii: boolean }, counts: Record<string, number>, depth = 0): unknown {
  if (typeof value === 'string') {
    const r = redact(value, options);
    for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + n;
    return r.text;
  }
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, options, counts, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v, options, counts, depth + 1)]));
}
