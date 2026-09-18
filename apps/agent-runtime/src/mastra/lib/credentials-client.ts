// Fetches a user's own coding-agent API key from apps/api's internal-only route, just-in-time,
// right before delegate_to_code (Gate 5) runs a sandboxed CLI - never persisted here, never
// logged. apps/agent-runtime deliberately has no Supabase access of its own (docs/ARCHITECTURE.md
// §6.5); this narrow HTTP call is the one bridge, the reverse direction of the API's own calls
// into this service (runtime.client.ts on the API side).

const apiUrl = (process.env.AURA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const internalToken = process.env.RUNTIME_INTERNAL_TOKEN;

export type CredentialProvider = 'anthropic' | 'openai';

// Returns null if the user hasn't connected a key for that provider, or if the internal call
// itself isn't configured (RUNTIME_INTERNAL_TOKEN unset) - callers turn either case into the
// same "connect your key first" message, since neither is actionable to a model.
export async function getApiKey(userId: string, provider: CredentialProvider): Promise<string | null> {
  if (!internalToken) return null;
  const res = await fetch(`${apiUrl}/internal/credentials/${encodeURIComponent(userId)}/${encodeURIComponent(provider)}`, {
    headers: { Authorization: `Bearer ${internalToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not reach apps/api for the ${provider} credential (${res.status})`);
  const body = (await res.json()) as { apiKey?: string };
  return body.apiKey ?? null;
}
