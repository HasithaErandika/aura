import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { peopleById } from "../identity/index.js";
import { auditRepository } from "./audit.repository.js";
import { exportQuerySchema, listQuerySchema } from "./audit.schemas.js";
import { auditActor, auditRowsToCsv, exportAudit, toAuditEntry, writeAudit } from "./audit.service.js";

const INTEGRITY_NOTE = "audit_logs is append-only in the database (a trigger blocks UPDATE/DELETE, including for the service role) - rows below were not editable after they were written.";

export const auditRouter = Router();
auditRouter.use(requireRole("admin"));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listQuerySchema, req.query);
    const rows = await auditRepository.list(query);
    const person = await peopleById(rows.map((r) => r.actor_id));
    res.json({
      entries: rows.map((row) => ({ ...toAuditEntry(row), actor: person(row.actor_id) })),
      nextBefore: rows.length === query.limit ? (rows[rows.length - 1]?.created_at ?? null) : null,
    });
  }),
);

auditRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const { format, ...filter } = parseOrThrow(exportQuerySchema, req.query);
    const user = currentUser(req);
    const { rows, truncated } = await exportAudit(filter);
    await writeAudit({ ...auditActor(req), action: "audit.exported", entityType: "audit_export", metadata: { filter: { ...filter, format }, rowCount: rows.length, truncated } });

    const exportedAt = new Date().toISOString();
    const fileStem = `aura-audit-export-${exportedAt.slice(0, 10)}`;
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileStem}.csv"`);
      res.send(auditRowsToCsv(rows));
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${fileStem}.json"`);
    res.json({
      manifest: { exportedBy: { id: user.id, role: user.role }, exportedAt, filter: { ...filter, format }, rowCount: rows.length, truncated, integrity: INTEGRITY_NOTE },
      entries: rows.map(toAuditEntry),
    });
  }),
);
