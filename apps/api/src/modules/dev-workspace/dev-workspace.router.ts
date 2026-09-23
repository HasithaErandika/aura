import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canEditDevWorkspace, canViewDevWorkspace } from "../policy/policy.js";
import { writeAudit } from "../audit/audit.service.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const devWorkspaceRouter = Router();

// Same shape/reasoning as workspace.router.ts's filePathSchema - the runtime's own containment
// check (server/dev-workspace-routes.ts) is the real guard, this just rejects the obviously
// wrong shape before making a call to the runtime.
const filePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_\-./]+$/)
  .refine((p) => !p.split("/").includes(".."), "path cannot contain '..'");

const disciplineSchema = z.enum(["Frontend", "Backend", "Data", "AI", "Integration"]);
const taskKeySchema = z.string().trim().max(40).optional();

// GET /dev-workspace/:epicKey/:discipline/files?taskKey=... - lists a Task's own isolated
// worktree files, or the shared base scaffold if taskKey is omitted (Gate 4/5 output).
devWorkspaceRouter.get(
  "/:epicKey/:discipline/files",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view scaffolded project files");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const discipline = parseOrThrow(disciplineSchema, req.params.discipline);
    const taskKey = parseOrThrow(taskKeySchema, req.query.taskKey);
    const { files } = await runtimeClient.listDevWorkspaceFiles(epicKey, discipline, taskKey);
    res.json({ epicKey, discipline, files });
  }),
);

// GET /dev-workspace/:epicKey/:discipline/file?path=...&taskKey=... - reads one file's content.
devWorkspaceRouter.get(
  "/:epicKey/:discipline/file",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view scaffolded project files");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const discipline = parseOrThrow(disciplineSchema, req.params.discipline);
    const path = parseOrThrow(filePathSchema, req.query.path);
    const taskKey = parseOrThrow(taskKeySchema, req.query.taskKey);
    try {
      const file = await runtimeClient.readDevWorkspaceFile(epicKey, discipline, path, taskKey);
      res.json({ epicKey, discipline, ...file });
    } catch {
      throw notFound("Scaffolded file");
    }
  }),
);

// Content limit matches workspace.router.ts's writeFileBodySchema.
const writeFileBodySchema = z.object({ path: filePathSchema, content: z.string().max(100_000), taskKey: taskKeySchema }).strict();

// PUT /dev-workspace/:epicKey/:discipline/file - overwrites one existing file (in a Task's
// worktree, or the base scaffold if taskKey is omitted) with human-edited content.
// Developer-role only (the code's own author); every save is audited.
devWorkspaceRouter.put(
  "/:epicKey/:discipline/file",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!canEditDevWorkspace(user.role)) throw forbidden("Your role cannot edit scaffolded project files");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const discipline = parseOrThrow(disciplineSchema, req.params.discipline);
    const { path, content, taskKey } = parseOrThrow(writeFileBodySchema, req.body);
    try {
      const file = await runtimeClient.writeDevWorkspaceFile(epicKey, discipline, path, content, taskKey);
      await writeAudit({
        actorId: user.id,
        actorRole: user.role,
        action: "workspace.file.edit",
        entityType: "dev_workspace_file",
        entityId: `${epicKey}/${discipline}/${taskKey ?? "base"}/${path}`,
        metadata: { epicKey, discipline, taskKey: taskKey ?? null, path, length: content.length },
      });
      res.json({ epicKey, discipline, ...file });
    } catch {
      throw notFound("Scaffolded file");
    }
  }),
);
