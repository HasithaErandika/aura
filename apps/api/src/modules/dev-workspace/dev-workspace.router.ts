import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewDevWorkspace } from "../policy/policy.js";
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

// GET /dev-workspace/:epicKey/:discipline/files - lists a Task's scaffolded files (Gate 4/5 output).
devWorkspaceRouter.get(
  "/:epicKey/:discipline/files",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view scaffolded project files");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const discipline = parseOrThrow(disciplineSchema, req.params.discipline);
    const { files } = await runtimeClient.listDevWorkspaceFiles(epicKey, discipline);
    res.json({ epicKey, discipline, files });
  }),
);

// GET /dev-workspace/:epicKey/:discipline/file?path=... - reads one scaffolded file's content.
devWorkspaceRouter.get(
  "/:epicKey/:discipline/file",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view scaffolded project files");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const discipline = parseOrThrow(disciplineSchema, req.params.discipline);
    const path = parseOrThrow(filePathSchema, req.query.path);
    try {
      const file = await runtimeClient.readDevWorkspaceFile(epicKey, discipline, path);
      res.json({ epicKey, discipline, ...file });
    } catch {
      throw notFound("Scaffolded file");
    }
  }),
);
