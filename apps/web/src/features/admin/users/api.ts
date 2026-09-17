import { api } from "../../../shared/api/client.ts";
import type { AdminUser } from "../../../types/api.ts";
import type { Role } from "../../../shared/lib/roles.ts";

export const usersApi = {
  list: () => api.get<{ users: AdminUser[] }>("/users").then((r) => r.users),
  create: (body: { email: string; fullName: string; role: Role }) => api.post<{ id: string; temporaryPassword?: string }>("/users", body),
  setRole: (id: string, role: Role) => api.patch<{ id: string; role: Role }>(`/users/${id}/role`, { role }),
  remove: (id: string) => api.delete<void>(`/users/${id}`),
};
