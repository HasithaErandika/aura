import { supabaseAdmin } from "../../lib/supabase.js";
import { errorMessage, logger } from "../../lib/logger.js";
import type { Role } from "../identity/roles.js";

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

// Append-only writer (FR-OBS-3). A failed audit write is logged loudly but never turns a
// successful user action into an error response; the log line is the fallback record.
export async function writeAudit(event: AuditEvent): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: event.actorId,
    actor_role: event.actorRole,
    action: event.action,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? null,
    request_id: event.requestId ?? null,
  });
  if (error) {
    logger.error("audit write failed", { action: event.action, message: error.message, event });
  }
}

export interface AuditQuery {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  limit: number;
  before?: string;
}

export async function listAudit(query: AuditQuery): Promise<AuditRow[]> {
  let builder = supabaseAdmin
    .from("audit_logs")
    .select("id, actor_id, actor_role, action, entity_type, entity_id, metadata, request_id, created_at")
    .order("created_at", { ascending: false })
    .limit(query.limit);

  if (query.action) builder = builder.ilike("action", `${query.action}%`);
  if (query.actorId) builder = builder.eq("actor_id", query.actorId);
  if (query.entityType) builder = builder.eq("entity_type", query.entityType);
  if (query.entityId) builder = builder.eq("entity_id", query.entityId);
  if (query.before) builder = builder.lt("created_at", query.before);

  const { data, error } = await builder;
  if (error) throw new Error(`audit query failed: ${errorMessage(error.message)}`);
  return (data ?? []) as AuditRow[];
}
