// Uses Groq as the primary LLM and directly falls back to Google Gemini when Groq fails, times out, or hits limits.
// Requires a Google AI Studio API key and uses the `google` provider prefix; OpenRouter is intentionally not used for this fallback.

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
