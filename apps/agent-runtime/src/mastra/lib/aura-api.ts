// apps/api's base URL and the runtime-token header for its /internal routes.
export function auraApiUrl(): string {
  return (process.env.AURA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

export function auraApiHeaders(json = true): Record<string, string> {
  const token = process.env.MASTRA_RUNTIME_TOKEN?.trim();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
