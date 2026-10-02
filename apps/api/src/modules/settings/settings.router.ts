import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { currentProjectId } from "../projects/index.js";
import { SETTING_DEFINITIONS } from "./settings.registry.js";
import { effectiveQuerySchema, keyParamSchema, listQuerySchema, putBodySchema, targetSchema } from "./settings.schemas.js";
import { effectiveSettings, listSettings, resetSetting, setSetting } from "./settings.service.js";

export const settingsRouter = Router();

settingsRouter.get("/definitions", (_req, res) => {
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
});

// mine=false leaves out the user's own preferences: what a reset falls back to.
settingsRouter.get(
  "/effective",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(effectiveQuerySchema, req.query);
    const projectId = query.projectId ?? (await currentProjectId());
    res.json({ projectId, settings: await effectiveSettings(projectId, query.mine === "false" ? null : currentUser(req).id) });
  }),
);

settingsRouter.get(
  "/mine",
  asyncHandler(async (req, res) => {
    res.json({ settings: await listSettings("user", currentUser(req).id) });
  }),
);

settingsRouter.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listQuerySchema, req.query);
    res.json({ settings: await listSettings(query.scope, query.scope === "project" ? (query.scopeId ?? null) : null) });
  }),
);

settingsRouter.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const key = parseOrThrow(keyParamSchema, req.params.key);
    const body = parseOrThrow(putBodySchema, req.body);
    const result = await setSetting(key, { scope: body.scope, scopeId: body.scopeId ?? null }, body.value, currentUser(req));
    const { scope, scopeId } = result.target;
    await writeAudit({ ...auditActor(req), action: "settings.updated", entityType: "setting", entityId: key, metadata: { key, scope, scopeId, before: result.before, after: result.after } });
    res.json({ key, scope, scopeId, value: result.after });
  }),
);

settingsRouter.delete(
  "/:key",
  asyncHandler(async (req, res) => {
    const key = parseOrThrow(keyParamSchema, req.params.key);
    const target = parseOrThrow(targetSchema, req.query);
    const result = await resetSetting(key, { scope: target.scope, scopeId: target.scopeId ?? null }, currentUser(req));
    await writeAudit({ ...auditActor(req), action: "settings.reset", entityType: "setting", entityId: key, metadata: { key, scope: result.target.scope, scopeId: result.target.scopeId, before: result.before } });
    res.status(204).send();
  }),
);
