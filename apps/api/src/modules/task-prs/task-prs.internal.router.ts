import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { notFound } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { writeAudit } from "../audit/index.js";
import { runsRepository } from "../runs/index.js";
import { recordPrSchema, taskKeyParamsSchema } from "./task-prs.schemas.js";
import { getTaskPr, recordPrOpened } from "./task-prs.service.js";

export const taskPrsInternalRouter = Router();

taskPrsInternalRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(recordPrSchema, req.body);
    const run = input.runId ? await runsRepository.findById(input.runId) : null;
    const openedBy = run?.requested_by ?? null;
    const view = await recordPrOpened(input, openedBy);
    await writeAudit({
      actorId: openedBy,
      actorRole: null,
      action: "task.pr_opened",
      entityType: "task_branch",
      entityId: view.taskKey,
      requestId: req.requestId,
      metadata: { repo: view.repo, branch: view.branch, prNumber: view.prNumber, runId: input.runId },
    });
    res.status(201).json({ taskPr: view });
  }),
);

taskPrsInternalRouter.get(
  "/:taskKey",
  asyncHandler(async (req, res) => {
    const { taskKey } = parseOrThrow(taskKeyParamsSchema, req.params);
    const view = await getTaskPr(taskKey);
    if (!view) throw notFound("Pull request for this Task");
    res.json({ taskPr: view });
  }),
);
