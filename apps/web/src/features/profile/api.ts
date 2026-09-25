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
