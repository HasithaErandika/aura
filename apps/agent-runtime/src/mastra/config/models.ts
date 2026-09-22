// Every agent runs on Groq as its primary model and fails over to one shared Google Gemini model
// when Groq errors, times out, or hits a rate limit - see withGeminiFallback() below. Requires a
// Google AI Studio API key (`google` provider prefix).
//
// Fallback model choice: gemini-3.5-flash-lite, not gemini-3.5-flash or the newer 3.6/3.7-flash.
// All three plain "flash" tiers share the same 20-requests/day free-tier ceiling, which one
// exhausted session emptied for every agent at once; "flash-lite" is a separate quota bucket at
// 500/day and was verified directly against both a plain call and a real function call. Gemma
// 4 (26B/31B) has a far larger daily quota but was rejected after direct testing: given a tool
// schema, it never emits a structured function call, only prose - unusable as a tool-calling
// fallback for the Orchestrator or the Coding Agent. OpenRouter is intentionally not used here.
export const GEMINI_FALLBACK_MODEL = 'google/gemini-3.5-flash-lite';

/**
 * Builds a Groq-primary, Gemini-fallback model list for an Agent's `model` field.
 *
 * @param groqModelId  the Groq model string, e.g. 'groq/qwen/qwen3.8-27b'
 * @param groqProviderOptions  Groq-only provider options (e.g. reasoningFormat) - scoped to the
 *   Groq entry only, since they mean nothing to Gemini and Gemini would just ignore an unknown
 *   provider key anyway, but keeping it explicit avoids relying on that.
 */
export function withGeminiFallback(groqModelId: string, groqProviderOptions?: Record<string, string | number | boolean>) {
  return [
    {
      id: 'groq',
      model: groqModelId,
      maxRetries: 1,
      ...(groqProviderOptions ? { providerOptions: { groq: groqProviderOptions } } : {}),
    },
    {
      id: 'gemini',
      model: GEMINI_FALLBACK_MODEL,
      maxRetries: 1,
    },
  ];
}

// If an Anthropic API subscription is ever added, the recommended wiring is a third tier in the
// same shape as withGeminiFallback above, not a wholesale provider switch:
//   - heavy tier (ORCHESTRATOR/PO/BA/ARCHITECT/MASTRA_CODING/QA/DEPLOYER, registry.ts) -> claude-sonnet-5.
//   - light tier (DEV/TESTER, registry.ts) -> claude-haiku-4-5-20251001.
//   - never claude-opus-5 or claude-fable-5-1 - both are priced well above what these short,
//     narrowly-scoped drafting/interpretation calls need; Sonnet is the ceiling, Haiku the floor.
// To keep token spend down once billed per token (unlike Groq/Gemini's free tiers today):
//   - enable Anthropic prompt caching (`cache_control: { type: 'ephemeral' }`) on each agent's
//     `instructions` block - every one of these agents sends the same large system prompt on
//     every single call (see orchestrator.ts's ~800-line instructions), so caching it is the
//     single highest-leverage saving available.
//   - keep `maxSteps: 1` (already set on every agent below) and Gate 4/5's fixed, code-built
//     prompts as they are - both already avoid the multi-turn back-and-forth that burns tokens.
//   - add Claude only as a third fallback entry behind Groq and Gemini, not as the primary -
//     Groq's free tier should keep absorbing the bulk of traffic regardless of what paid option
//     exists behind it.
