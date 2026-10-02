import type { Role } from "../../lib/auth/roles.js";

export interface AuditEvent {
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_role: Role | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
}

export interface AuditFilter {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}

export interface AuditEntryView {
  id: number;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}
