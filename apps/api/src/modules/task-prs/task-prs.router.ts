import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { badRequest, forbidden, notFound, unauthenticated } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { logger } from "../../lib/logger.js";
import { currentUser } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { canViewTaskPrs } from "../policy/policy.js";
import { runsRepository } from "../runs/runs.repository.js";
import { listNotifications, markRead } from "./notifications.service.js";
import { OidcError, verifyGithubOidc } from "./oidc.js";
import { UnknownBranchError, getTaskPr, listTaskPrs, recordCiReport, recordPrOpened } from "./task-prs.service.js";
import { TASK_KEY, ciReportSchema, listQuerySchema, recordPrSchema } from "./task-prs.types.js";

// Pull requests and CI per Task, and notifications (docs/plans/aura-vscode-agents.md V6).

// Signed-in: the QA page and the VS Code PR view. Same audience as the QA workspace.
export const taskPrsRouter = Router();

taskPrsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!canViewTaskPrs(currentUser(req).role)) throw forbidden("You cannot view Task pull requests");
    res.json({ taskPrs: await listTaskPrs(parseOrThrow(listQuerySchema, req.query)) });
  }),
);

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listNotifications(currentUser(req).id));
  }),
);

notificationsRouter.post(
  "/read",
  asyncHandler(async (req, res) => {
    const { ids } = parseOrThrow(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict(), req.body ?? {});
    await markRead(currentUser(req).id, ids);
    res.json({ ok: true });
  }),
);

// Public, before sign-in: aura-ci.yml reports a CI run with a GitHub Actions OIDC token, which
// proves the repository; no secret lives in the repository.
export const ciPublicRouter = Router();

ciPublicRouter.post(
  "/report",
  asyncHandler(async (req, res) => {
    const token = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) throw unauthenticated("A GitHub Actions OIDC token is required");
    let repo: string;
    try {
      repo = (await verifyGithubOidc(token, { audience: env.ciOidcAudience })).repository;
    } catch (error) {
      if (error instanceof OidcError) throw unauthenticated(error.message);
      throw error;
    }
    const report = parseOrThrow(ciReportSchema, req.body);
    try {
      const view = await recordCiReport(repo, report);
      await writeAudit({ actorId: null, actorRole: null, action: "ci.reported", entityType: "task_branch", entityId: view.taskKey, requestId: req.requestId, metadata: { repo, branch: report.branch, state: view.ciState, prNumber: view.prNumber, headSha: report.headSha ?? null } });
      res.json({ taskKey: view.taskKey, ciState: view.ciState });
    } catch (error) {
      if (error instanceof UnknownBranchError) {
        logger.info("CI report ignored", { repo, branch: report.branch, reason: error.message });
        throw badRequest(error.message);
      }
      throw error;
    }
  }),
);

// Runtime only (mounted under /internal): Gate 6 recorded the PR it opened, and the VS Code agent
// reads a Task's PR and CI.
export const taskPrsInternalRouter = Router();

taskPrsInternalRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(recordPrSchema, req.body);
    const run = input.runId ? await runsRepository.findById(input.runId) : null;
    const view = await recordPrOpened(input, run?.requested_by ?? null);
    await writeAudit({ actorId: run?.requested_by ?? null, actorRole: null, action: "task.pr_opened", entityType: "task_branch", entityId: view.taskKey, requestId: req.requestId, metadata: { repo: view.repo, branch: view.branch, prNumber: view.prNumber, runId: input.runId } });
    res.status(201).json({ taskPr: view });
  }),
);

taskPrsInternalRouter.get(
  "/:taskKey",
  asyncHandler(async (req, res) => {
    const { taskKey } = parseOrThrow(z.object({ taskKey: z.string().regex(TASK_KEY) }), req.params);
    const view = await getTaskPr(taskKey);
    if (!view) throw notFound("Pull request for this Task");
    res.json({ taskPr: view });
  }),
);
