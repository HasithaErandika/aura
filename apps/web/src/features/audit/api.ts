import { api } from "../../shared/api/client.ts";
import type { AuditEntry } from "../../types/api.ts";

export interface AuditQuery {
  action?: string;
  entityType?: string;
  entityId?: string;
  before?: string;
}

export const auditApi = {
  list: (query: AuditQuery) => {
    const params = new URLSearchParams();
    if (query.action) params.set("action", query.action);
    if (query.entityType) params.set("entityType", query.entityType);
    if (query.entityId) params.set("entityId", query.entityId);
    if (query.before) params.set("before", query.before);
    const qs = params.toString();
    return api.get<{ entries: AuditEntry[]; nextBefore: string | null }>(`/audit${qs ? `?${qs}` : ""}`);
  },
};
