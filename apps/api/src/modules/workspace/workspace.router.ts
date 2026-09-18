import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewArchitectWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const workspaceRouter = Router();

// Relative file paths only (no leading slash, no ".." segments) - LocalFilesystem's own
// `contained: true` default already blocks traversal server-side, this just rejects the
// obviously-wrong shape before making a call to the runtime.
const filePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_\-./]+$/)
  .refine((p) => !p.split("/").includes(".."), "path cannot contain '..'");

// GET /workspace - lists every Epic that has a workspace, so the UI can offer them to browse
// instead of requiring the human to already know and type an Epic key.
workspaceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewArchitectWorkspace(user.role)) throw forbidden("Your role cannot view the Architect workspace");
    const { epics } = await runtimeClient.listWorkspaceEpics();
    res.json({ epics });
  }),
);

// GET /workspace/:epicKey/files - lists the Architect's design documents for that Epic.
workspaceRouter.get(
  "/:epicKey/files",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewArchitectWorkspace(user.role)) throw forbidden("Your role cannot view the Architect workspace");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const { files } = await runtimeClient.listWorkspaceFiles(epicKey);
    res.json({ epicKey, files });
  }),
);

// GET /workspace/:epicKey/file?path=... - reads one document's content.
workspaceRouter.get(
  "/:epicKey/file",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewArchitectWorkspace(user.role)) throw forbidden("Your role cannot view the Architect workspace");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const path = parseOrThrow(filePathSchema, req.query.path);
    try {
      const file = await runtimeClient.readWorkspaceFile(epicKey, path);
      res.json({ epicKey, ...file });
    } catch {
      throw notFound("Workspace file");
    }
  }),
);
