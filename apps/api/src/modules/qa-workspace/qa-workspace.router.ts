import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewQaWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const qaWorkspaceRouter = Router();

// Same shape/reasoning as workspace.router.ts's filePathSchema.
const filePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_\-./]+$/)
  .refine((p) => !p.split("/").includes(".."), "path cannot contain '..'");

// GET /qa-workspace - lists every Epic that has a QA workspace (Gate 6 filed).
qaWorkspaceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewQaWorkspace(user.role)) throw forbidden("Your role cannot view the QA workspace");
    const { epics } = await runtimeClient.listQaWorkspaceEpics();
    res.json({ epics });
  }),
);

// GET /qa-workspace/:epicKey/files - lists the test plan + Playwright source for that Epic.
qaWorkspaceRouter.get(
  "/:epicKey/files",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewQaWorkspace(user.role)) throw forbidden("Your role cannot view the QA workspace");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const { files } = await runtimeClient.listQaWorkspaceFiles(epicKey);
    res.json({ epicKey, files });
  }),
);

// GET /qa-workspace/:epicKey/file?path=... - reads one test-plan/spec file's content.
qaWorkspaceRouter.get(
  "/:epicKey/file",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewQaWorkspace(user.role)) throw forbidden("Your role cannot view the QA workspace");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const path = parseOrThrow(filePathSchema, req.query.path);
    try {
      const file = await runtimeClient.readQaWorkspaceFile(epicKey, path);
      res.json({ epicKey, ...file });
    } catch {
      throw notFound("QA workspace file");
    }
  }),
);
