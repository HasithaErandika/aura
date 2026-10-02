import type { Request } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { logger } from "../../lib/logger.js";
import { auditRepository } from "./audit.repository.js";
import type { AuditExportQuery } from "./audit.schemas.js";
import type { AuditEntryView, AuditEvent, AuditRow } from "./audit.types.js";

const EXPORT_PAGE_SIZE = 1000;
const EXPORT_HARD_CAP = 50_000;
const CSV_COLUMNS = ["id", "created_at", "actor_id", "actor_role", "action", "entity_type", "entity_id", "request_id", "metadata"] as const;

// A failed audit write is logged loudly but never fails the user's action.
export async function writeAudit(event: AuditEvent): Promise<void> {
  const error = await auditRepository.insert(event);
  if (error) logger.error("audit write failed", { action: event.action, message: error.message, event });
}

export function auditActor(req: Request): Pick<AuditEvent, "actorId" | "actorRole" | "requestId"> {
  const user = currentUser(req);
  return { actorId: user.id, actorRole: user.role, requestId: req.requestId };
}

export function toAuditEntry(row: AuditRow): AuditEntryView {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

export async function exportAudit(query: Omit<AuditExportQuery, "format">): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const rows: AuditRow[] = [];
  let afterId = 0;
  for (;;) {
    const page = await auditRepository.page(query, afterId, EXPORT_PAGE_SIZE);
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE || rows.length > EXPORT_HARD_CAP) break;
    afterId = page[page.length - 1]!.id;
  }
  return { rows: rows.slice(0, EXPORT_HARD_CAP), truncated: rows.length > EXPORT_HARD_CAP };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditRowsToCsv(rows: AuditRow[]): string {
  const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(column === "metadata" ? (row.metadata ? JSON.stringify(row.metadata) : "") : row[column])).join(","));
  return [CSV_COLUMNS.join(","), ...lines].join("\n");
}
