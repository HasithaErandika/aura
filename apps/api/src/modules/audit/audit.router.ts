import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { listAudit } from "./audit.service.js";

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
