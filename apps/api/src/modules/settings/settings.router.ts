import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { validationFailed } from "../../lib/http/errors.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { SETTING_DEFINITIONS, SETTING_SCOPES } from "./settings.registry.js";
import { currentProjectId, effectiveSettings, listSettings, lookupDefinition, resetSetting, setSetting } from "./settings.service.js";

// Dashboard settings (docs/plans/aura-automation-durability.md Part A). Admins change global and
// project values; every user changes only their own preferences. Every change is audited.

export const settingsRouter = Router();

const keyParam = z.string().min(3).max(80).regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);

const listQuery = z
  .object({
    scope: z.enum(["global", "project"]),
    scopeId: z.string().uuid().optional(),
  })
  .strict();

const targetSchema = z
  .object({
    scope: z.enum(SETTING_SCOPES),
    scopeId: z.string().uuid().nullish(),
  })
  .strict();

const putBody = targetSchema.extend({ value: z.union([z.string(), z.number(), z.boolean()]) }).strict();

// The registry, so the UI renders every setting with its bounds and default.
settingsRouter.get(
  "/definitions",
  asyncHandler(async (_req, res) => {
    res.json({
      definitions: SETTING_DEFINITIONS.map((d) => ({
        key: d.key,
        group: d.group,
        label: d.label,
        description: d.description,
        owner: d.owner,
        scopes: d.scopes,
        input: d.input,
        cap: d.cap ?? false,
        default: d.fallback(),
      })),
    });
  }),
);

// What applies to the signed-in user, with where each value comes from.
settingsRouter.get(
  "/effective",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = parseOrThrow(z.object({ projectId: z.string().uuid().optional(), mine: z.enum(["true", "false"]).optional() }).strict(), req.query);
    const project = query.projectId ?? (await currentProjectId());
    // mine=false: what applies without the user's own preferences (what a reset falls back to).
    res.json({ projectId: project, settings: await effectiveSettings(project, query.mine === "false" ? null : user.id) });
  }),
);

// The signed-in user's own preferences.
settingsRouter.get(
  "/mine",
  asyncHandler(async (req, res) => {
    res.json({ settings: await listSettings("user", currentUser(req).id) });
  }),
);

// Stored global or project values (admin).
settingsRouter.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listQuery, req.query);
    if (query.scope === "project" && !query.scopeId) throw validationFailed({ scopeId: ["Required for project scope"] });
    res.json({ settings: await listSettings(query.scope, query.scope === "project" ? query.scopeId ?? null : null) });
  }),
);

settingsRouter.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const key = parseOrThrow(keyParam, req.params.key);
    lookupDefinition(key);
    const body = parseOrThrow(putBody, req.body);
    const result = await setSetting(key, { scope: body.scope, scopeId: body.scopeId ?? null }, body.value, user);
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "settings.updated",
      entityType: "setting",
      entityId: key,
      requestId: req.requestId,
      metadata: { key, scope: result.target.scope, scopeId: result.target.scopeId, before: result.before, after: result.after },
    });
    res.json({ key, scope: result.target.scope, scopeId: result.target.scopeId, value: result.after });
  }),
);

settingsRouter.delete(
  "/:key",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const key = parseOrThrow(keyParam, req.params.key);
    lookupDefinition(key);
    const target = parseOrThrow(targetSchema, req.query);
    const result = await resetSetting(key, { scope: target.scope, scopeId: target.scopeId ?? null }, user);
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "settings.reset",
      entityType: "setting",
      entityId: key,
      requestId: req.requestId,
      metadata: { key, scope: result.target.scope, scopeId: result.target.scopeId, before: result.before },
    });
    res.status(204).send();
  }),
);
