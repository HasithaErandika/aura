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

export interface AuditExportQuery {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

// Evidence exports (SOC2/ISO reviews - docs/ARCHITECTURE.md section 5.3) can span an audit
// period much larger than the Audit Explorer's 200-row page, but an unbounded query against an
// append-only table that only grows is still a real cost - PAGE_SIZE keeps each round trip
// small, and HARD_CAP is a backstop against accidentally exporting the entire table, not a
// realistic ceiling for a reporting period.
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_HARD_CAP = 50_000;

// Fetches every row matching an evidence request, oldest first (the order an auditor reads a
// trail in), paginating past the 200-row cap listAudit enforces for the interactive explorer.
export async function exportAudit(query: AuditExportQuery): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const rows: AuditRow[] = [];
  let truncated = false;
  let cursor: string | undefined;

  for (;;) {
    let builder = supabaseAdmin
      .from("audit_logs")
      .select("id, actor_id, actor_role, action, entity_type, entity_id, metadata, request_id, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(EXPORT_PAGE_SIZE);

    if (query.action) builder = builder.ilike("action", `${query.action}%`);
    if (query.actorId) builder = builder.eq("actor_id", query.actorId);
    if (query.entityType) builder = builder.eq("entity_type", query.entityType);
    if (query.entityId) builder = builder.eq("entity_id", query.entityId);
    if (query.from) builder = builder.gte("created_at", query.from);
    if (query.to) builder = builder.lte("created_at", query.to);
    if (cursor) builder = builder.gt("created_at", cursor);

    const { data, error } = await builder;
    if (error) throw new Error(`audit export failed: ${errorMessage(error.message)}`);
    const page = (data ?? []) as AuditRow[];
    if (page.length === 0) break;

    rows.push(...page);
    if (rows.length >= EXPORT_HARD_CAP) {
      truncated = true;
      break;
    }
    if (page.length < EXPORT_PAGE_SIZE) break;
    cursor = page[page.length - 1]!.created_at;
  }

  return { rows: rows.slice(0, EXPORT_HARD_CAP), truncated };
}

// Renders rows as RFC 4180 CSV for evidence packages opened in a spreadsheet, not just JSON
// tooling. metadata is serialized as a JSON string cell rather than expanded, since its shape
// varies by action.
export function auditRowsToCsv(rows: AuditRow[]): string {
  const header = ["id", "created_at", "actor_id", "actor_role", "action", "entity_type", "entity_id", "request_id", "metadata"];
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.id, r.created_at, r.actor_id, r.actor_role, r.action, r.entity_type, r.entity_id, r.request_id, r.metadata ? JSON.stringify(r.metadata) : ""].map(escape).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
