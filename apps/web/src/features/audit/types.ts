import type { Person } from "@/shared/api/types.ts";
import type { Role } from "@/shared/lib/roles.ts";

export interface AuditEntry {
  id: number;
  actorId: string | null;
  actorRole: Role | null;
  actor: Person | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}
