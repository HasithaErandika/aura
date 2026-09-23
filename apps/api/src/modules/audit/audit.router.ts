import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { auditRowsToCsv, exportAudit, listAudit, writeAudit } from "./audit.service.js";

export const auditRouter = Router();
auditRouter.use(requireRole("admin"));

const querySchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(128).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// GET /audit: the Audit Explorer feed (UC-9). Read only; the table itself is append-only.
auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(querySchema, req.query);
    const rows = await listAudit(query);
    const profiles = await profilesById(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)));
    res.json({
      entries: rows.map((row) => {
        const actor = row.actor_id ? profiles.get(row.actor_id) : undefined;
        return {
          id: row.id,
          actorId: row.actor_id,
          actorRole: row.actor_role,
          actor: actor ? { fullName: actor.fullName, email: actor.email } : null,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          metadata: row.metadata,
          requestId: row.request_id,
          createdAt: row.created_at,
        };
      }),
      nextBefore: rows.length === query.limit ? rows[rows.length - 1]?.created_at : null,
    });
  }),
);

const exportQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(128).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

// GET /audit/export: a downloadable evidence bundle for SOC2/ISO reviews (docs/ARCHITECTURE.md
// section 5.3) - the same append-only trail as the Audit Explorer, but unpaginated (within
// exportAudit's own hard cap) and framed with the export's own provenance (who pulled it, when,
// under what filter) so the file stands on its own once it leaves AURA. The export action is
// itself audited, same as every other admin action - an evidence trail that can't say who
// requested it isn't evidence.
auditRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(exportQuerySchema, req.query);
    const user = currentUser(req);
    const { rows, truncated } = await exportAudit(query);

    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "audit.exported",
      entityType: "audit_export",
      metadata: { filter: query, rowCount: rows.length, truncated },
    });

    const generatedAt = new Date().toISOString();
    const fileStem = `aura-audit-export-${generatedAt.slice(0, 10)}`;

    if (query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileStem}.csv"`);
      res.send(auditRowsToCsv(rows));
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileStem}.json"`);
    res.json({
      manifest: {
        exportedBy: { id: user.id, role: user.role },
        exportedAt: generatedAt,
        filter: query,
        rowCount: rows.length,
        truncated,
        integrity: "audit_logs is append-only in the database (a trigger blocks UPDATE/DELETE, including for the service role) - rows below were not editable after they were written.",
      },
      entries: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata,
        requestId: row.request_id,
        createdAt: row.created_at,
      })),
    });
  }),
);
