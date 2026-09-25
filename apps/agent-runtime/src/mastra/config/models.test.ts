import { describe, expect, it } from 'vitest';
import { GEMINI_FALLBACK_MODEL, modelChain, withGeminiFallback } from './models';

describe('modelChain', () => {
  it('keeps the given order as the fallback order', () => {
    expect(modelChain(['a/x', 'b/y', 'c/z']).map((m) => m.model)).toEqual(['a/x', 'b/y', 'c/z']);
  });

  it('attaches Groq-only provider options to Groq entries only', () => {
    const [groq, gemini] = modelChain(['groq/openai/gpt-oss-120b', 'google/gemini-x'], { reasoningFormat: 'hidden' });
    expect(groq).toMatchObject({ providerOptions: { groq: { reasoningFormat: 'hidden' } } });
    expect(gemini).not.toHaveProperty('providerOptions');
  });

  it('gives every entry a unique id', () => {
    const ids = modelChain(['groq/a', 'groq/b', 'google/c']).map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('refuses an empty chain', () => {
    expect(() => modelChain([])).toThrow();
  });

  it('builds the Groq → Gemini fallback every agent uses', () => {
    expect(withGeminiFallback('groq/qwen/qwen3.8-27b').map((m) => m.model)).toEqual(['groq/qwen/qwen3.8-27b', GEMINI_FALLBACK_MODEL]);
  });
});
