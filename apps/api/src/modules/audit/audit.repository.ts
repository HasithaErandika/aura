import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { AuditEvent, AuditFilter, AuditRow } from "./audit.types.js";

const COLUMNS = "id, actor_id, actor_role, action, entity_type, entity_id, metadata, request_id, created_at";

type Query = ReturnType<ReturnType<typeof supabaseAdmin.from>["select"]>;

function filtered(query: Query, filter: AuditFilter): Query {
  let q = query;
  if (filter.action) q = q.ilike("action", `${filter.action}%`);
  if (filter.actorId) q = q.eq("actor_id", filter.actorId);
  if (filter.entityType) q = q.eq("entity_type", filter.entityType);
  if (filter.entityId) q = q.eq("entity_id", filter.entityId);
  return q;
}

export const auditRepository = {
  async insert(event: AuditEvent): Promise<{ message: string } | null> {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: event.actorId,
      actor_role: event.actorRole,
      action: event.action,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      metadata: event.metadata ?? null,
      request_id: event.requestId ?? null,
    });
    return error;
  },

  async list(filter: AuditFilter & { before?: string; limit: number }): Promise<AuditRow[]> {
    let query = filtered(supabaseAdmin.from("audit_logs").select(COLUMNS), filter);
    if (filter.before) query = query.lt("created_at", filter.before);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(filter.limit);
    if (error) throw dbError("audit query", error);
    return (data ?? []) as AuditRow[];
  },

  async page(filter: AuditFilter & { from?: string; to?: string }, afterId: number, size: number): Promise<AuditRow[]> {
    let query = filtered(supabaseAdmin.from("audit_logs").select(COLUMNS), filter).gt("id", afterId);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);
    const { data, error } = await query.order("id", { ascending: true }).limit(size);
    if (error) throw dbError("audit export", error);
    return (data ?? []) as AuditRow[];
  },
};
