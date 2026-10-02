// Every agent runs on Groq first and fails over to one shared Gemini model (withGeminiFallback).
// flash-lite has its own 500/day free quota and handles tool calls; Gemma was rejected (no tool calls).
export const GEMINI_FALLBACK_MODEL = 'google/gemini-3.5-flash-lite';

type ProviderOptions = Record<string, string | number | boolean>;

// Fallback model list: each later id is tried only when the one before it fails or is limited.
export function modelChain(modelIds: readonly string[], groqProviderOptions?: ProviderOptions) {
  if (modelIds.length === 0) throw new Error('modelChain needs at least one model id');
  return modelIds.map((model, index) => {
    const provider = model.split('/')[0] ?? 'model';
    return {
      id: `${provider}-${index}`,
      model,
      maxRetries: 1,
      ...(provider === 'groq' && groqProviderOptions ? { providerOptions: { groq: groqProviderOptions } } : {}),
    };
  });
}

// Groq-primary, Gemini-fallback model list; Groq provider options apply to the Groq entry only.
export function withGeminiFallback(groqModelId: string, groqProviderOptions?: ProviderOptions) {
  return modelChain([groqModelId, GEMINI_FALLBACK_MODEL], groqProviderOptions);
}

// Adding Claude later: a third entry behind Groq and Gemini (Sonnet for heavy, Haiku for light),
// with prompt caching on each agent's instructions.
