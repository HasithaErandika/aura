import { Router } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { approvalViewsForRun } from "../approvals/index.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { lastEventIdOf, stopRun, streamRunEvents } from "../orchestration/index.js";
import { canStopRun } from "../policy/index.js";
import { runsRepository } from "./runs.repository.js";
import { eventsQuerySchema, listQuerySchema, noteSchema } from "./runs.schemas.js";
import { addRunNote, assertCanAddNote, listRunsFor, requireRun, requireViewableRun, runViews } from "./runs.service.js";
import { toRunStepView } from "./runs.types.js";

export const runsRouter = Router();

runsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listQuerySchema, req.query);
    res.json({ runs: await runViews(await listRunsFor(currentUser(req), query)) });
  }),
);

runsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await requireViewableRun(uuidParam(req.params.id, "Run"), user);
    const [steps, approvals, [view]] = await Promise.all([runsRepository.listSteps(run.id), approvalViewsForRun(run.id, user), runViews([run])]);
    res.json({ run: view, steps: steps.map(toRunStepView), approvals });
  }),
);

runsRouter.get(
  "/:id/events",
  asyncHandler(async (req, res) => {
    const run = await requireViewableRun(uuidParam(req.params.id, "Run"), currentUser(req));
    const { after } = parseOrThrow(eventsQuerySchema, req.query);
    await streamRunEvents(req, res, run.id, after === "turn" ? await lastEventIdOf(run.id, "done") : after);
  }),
);

runsRouter.post(
  "/:id/stop",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await requireRun(uuidParam(req.params.id, "Run"));
    if (!canStopRun(user, { requestedBy: run.requested_by })) throw forbidden("Only the developer who started this run can stop it");
    res.status(202).json({ result: await stopRun(run, user, req.requestId) });
  }),
);

runsRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await requireRun(uuidParam(req.params.id, "Run"));
    assertCanAddNote(run, user);
    const { text } = parseOrThrow(noteSchema, req.body);
    const note = await addRunNote(run.id, user.id, text);
    await writeAudit({ ...auditActor(req), action: "run.note_added", entityType: "workflow_run", entityId: run.id, metadata: { chars: text.length } });
    res.status(201).json({ note });
  }),
);
