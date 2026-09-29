import { api } from "../../shared/api/client.ts";

export interface AccessToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revoked: boolean;
  expired: boolean;
}

// Personal access tokens for the `aura` CLI / VS Code extension (apps/api identity/me.router.ts).
export const tokensApi = {
  list: () => api.get<{ tokens: AccessToken[] }>("/me/tokens").then((r) => r.tokens),
  create: (name: string, expiresInDays: number) => api.post<{ token: string; accessToken: AccessToken }>("/me/tokens", { name, expiresInDays }),
  revoke: (id: string) => api.delete<void>(`/me/tokens/${id}`),
};

export interface GitIdentity {
  name: string | null;
  email: string | null;
}

// The name/email AURA commits as when you approve a gate (apps/api identity/me.router.ts). Unset,
// AURA authors those commits itself and records you in an Approved-by trailer.
export const gitIdentityApi = {
  get: () => api.get<{ gitIdentity: GitIdentity }>("/me").then((r) => r.gitIdentity),
  save: (name: string, email: string) => api.put<{ gitIdentity: GitIdentity }>("/me/git-identity", { name, email }).then((r) => r.gitIdentity),
};
