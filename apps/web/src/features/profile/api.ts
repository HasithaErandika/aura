import { api } from "../../shared/api/client.ts";

export type CredentialProvider = "anthropic" | "openai";

export interface CredentialSummary {
  provider: CredentialProvider;
  connected: boolean;
  preview: string | null;
  updatedAt: string | null;
}

// Manages the caller's own coding-agent API keys (Claude Code / Codex, Gate 5). The key itself
// never round-trips through the browser after being set - only a masked preview does.
export const credentialsApi = {
  list: () => api.get<{ credentials: CredentialSummary[] }>("/credentials").then((r) => r.credentials),
  set: (provider: CredentialProvider, apiKey: string) => api.put<{ credentials: CredentialSummary[] }>(`/credentials/${provider}`, { apiKey }).then((r) => r.credentials),
  remove: (provider: CredentialProvider) => api.delete<{ credentials: CredentialSummary[] }>(`/credentials/${provider}`).then((r) => r.credentials),
};
