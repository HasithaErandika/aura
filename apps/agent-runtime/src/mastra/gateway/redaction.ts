import type { Processor, ProcessInputStepArgs } from '@mastra/core/processors';
import { settingsFrom, SETTINGS_CONTEXT_KEY } from '../config/settings';
import { noteRedactions, turnRequestContext } from '../config/turn-context';
import { kindOf, redact, redactDeep } from '../lib/redact';

// Runs before every model call of every agent (roadmap step 4.3): secrets, and personal data
// unless the project turned it off, are removed from the messages and tool results the model is
// about to see. Edits are in place, so stored history is redacted too. System instructions are
// AURA's own text and are left alone.

interface RequestContextLike {
  get: (key: string) => unknown;
}

type Part = { type?: string; text?: string; toolInvocation?: { result?: unknown } };
type Message = { content?: { parts?: Part[]; content?: unknown } };

export function piiOn(requestContext: RequestContextLike | undefined): boolean {
  const direct = requestContext?.get(SETTINGS_CONTEXT_KEY) !== undefined ? requestContext : undefined;
  return settingsFrom(direct ?? turnRequestContext()).piiRedaction !== 'off';
}

export function redactMessages(messages: Message[], pii: boolean): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (more: Record<string, number>) => {
    for (const [k, n] of Object.entries(more)) counts[k] = (counts[k] ?? 0) + n;
  };
  for (const message of messages) {
    const content = message.content;
    if (!content) continue;
    if (typeof content.content === 'string') {
      const r = redact(content.content, { pii });
      content.content = r.text;
      add(r.counts);
    }
    for (const part of content.parts ?? []) {
      if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') {
        const r = redact(part.text, { pii });
        part.text = r.text;
        add(r.counts);
      } else if (part.type === 'tool-invocation' && part.toolInvocation && 'result' in part.toolInvocation) {
        part.toolInvocation.result = redactDeep(part.toolInvocation.result, { pii }, counts);
      }
    }
  }
  return counts;
}

export const redactionProcessor = {
  id: 'aura-redaction',
  name: 'AURA redaction',
  processInputStep({ messages, requestContext }: ProcessInputStepArgs) {
    const counts = redactMessages(messages as unknown as Message[], piiOn(requestContext as RequestContextLike | undefined));
    if (Object.keys(counts).length) {
      noteRedactions(counts);
      console.log(`[aura-redaction] ${JSON.stringify(counts)}`);
    }
  },
} satisfies Processor;

// The note shown on a draft whose sources had something removed.
export function redactionBanner(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  const total = (kind: 'secret' | 'pii') => entries.filter(([rule]) => kindOf(rule) === kind).reduce((n, [, c]) => n + c, 0);
  const parts = [total('secret') ? `${total('secret')} secret${total('secret') === 1 ? '' : 's'}` : '', total('pii') ? `${total('pii')} personal-data item${total('pii') === 1 ? '' : 's'}` : ''].filter(Boolean);
  return `> 🔒 AURA removed ${parts.join(' and ')} (${entries.map(([rule, n]) => `${rule} ×${n}`).join(', ')}) from the source content before the model saw it.\n`;
}
