import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { notFound } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { writeAudit } from "../audit/index.js";
import { runsRepository } from "../runs/index.js";
import { dependenciesSchema, recordPrSchema, storiesSchema, taskEventSchema, taskKeyParamsSchema } from "./task-prs.schemas.js";
import { getTaskPr, recordDependencies, recordPrOpened, recordStories, taskDependencies } from "./task-prs.service.js";
import { moveEpicTasks, moveTaskStatus } from "./task-status.js";

export const taskPrsInternalRouter = Router();

taskPrsInternalRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(recordPrSchema, req.body);
    const run = input.runId ? await runsRepository.findById(input.runId) : null;
    const openedBy = run?.requested_by ?? null;
    const view = await recordPrOpened(input, openedBy, req.requestId);
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

// Answers at once; the Jira moves run after, best-effort and audited.
taskPrsInternalRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(taskEventSchema, req.body);
    if (input.event === "started") void moveTaskStatus(input.taskKey, "started", req.requestId);
    else void moveEpicTasks(input.epicKey, "released", req.requestId);
    res.status(202).json({ accepted: true });
  }),
);

// Gate 3 files the Architect's Tasks with the order they must merge in.
taskPrsInternalRouter.post(
  "/dependencies",
  asyncHandler(async (req, res) => {
    const { dependencies } = parseOrThrow(dependenciesSchema, req.body);
    await recordDependencies(dependencies);
    await writeAudit({ actorId: null, actorRole: null, action: "task.dependencies_recorded", entityType: "task_branch", entityId: dependencies[0]?.taskKey, requestId: req.requestId, metadata: { dependencies } });
    res.status(201).json({ recorded: dependencies.length });
  }),
);

// Gate 3: which Stories each Task implements, so the AURA QA check knows its scenarios.
taskPrsInternalRouter.post(
  "/stories",
  asyncHandler(async (req, res) => {
    const { stories } = parseOrThrow(storiesSchema, req.body);
    await recordStories(stories);
    res.status(201).json({ recorded: stories.length });
  }),
);

taskPrsInternalRouter.get(
  "/:taskKey/dependencies",
  asyncHandler(async (req, res) => {
    const { taskKey } = parseOrThrow(taskKeyParamsSchema, req.params);
    res.json(await taskDependencies(taskKey));
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
