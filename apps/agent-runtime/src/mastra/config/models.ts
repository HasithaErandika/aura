// Every agent that calls an LLM tries Groq first and fails over to Gemini's free tier if Groq
// errors, times out, or gets rate-limited after its retries are exhausted - Mastra's built-in
// model-list mechanism (Agent.model as an array) does this automatically, per call, with no
// custom retry code needed here.
//
// Direct Gemini, not via OpenRouter: the point of a second provider is to not depend on any
// one vendor's outage or free-tier limit. Routing the fallback through OpenRouter would just
// put another single third-party hop in front of Gemini - an OpenRouter outage or its own
// (tighter) free-tier cap would take out the fallback too, without buying any real independence
// from Groq. A direct Google AI Studio key talks to Google's API with nothing in between.
// OpenRouter is still a reasonable choice for a *third* leg later (it can front many providers
// behind one key), just not as good a second leg as a direct API.
//
// Get a free key with no billing account at https://aistudio.google.com (Google AI Studio),
// then set GOOGLE_GENERATIVE_AI_API_KEY in .env.
//
// Provider prefix is "google", not "gemini": Mastra resolves provider ids against the live
// models.dev catalog, which lists this provider as "google" (the "gemini" case in Mastra's
// resolver only fires if models.dev also has a separate "gemini" entry, which it does not) -
// "gemini/..." would fail with "no config for provider gemini" even with a valid key.
export const GEMINI_FALLBACK_MODEL = 'google/gemini-3.5-flash';

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
      // One retry on Groq's side before handing off to Gemini; Groq's free tier fails mostly
      // on transient rate limits, which a single retry often clears without needing to fail
      // over at all.
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
