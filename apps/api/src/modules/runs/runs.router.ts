import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { enumList, parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { agentsApprovedByRole, canStopRun, canViewRun } from "../policy/policy.js";
import { approvalsRepository } from "../approvals/approvals.repository.js";
import { toApprovalViews } from "../approvals/approvals.service.js";
import { streamRunEvents } from "../orchestration/follow-http.js";
import { supabaseRunEventStore } from "../orchestration/run-events.js";
import { stopRun } from "../orchestration/stop-run.js";
import { runsRepository } from "./runs.repository.js";
import { RUN_STATUSES, toRunStepView, toRunView, type RunRow } from "./runs.types.js";

export const runsRouter = Router();

const listQuerySchema = z
  .object({
    status: enumList(RUN_STATUSES),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

async function withRequesters(rows: RunRow[]) {
  const profiles = await profilesById(rows.map((r) => r.requested_by));
  return rows.map((row) => {
    const p = profiles.get(row.requested_by);
    return toRunView(row, p ? { fullName: p.fullName, email: p.email } : null);
  });
}

runsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { status, limit } = parseOrThrow(listQuerySchema, req.query);
    let rows =
      user.role === "admin"
        ? await runsRepository.list({ status, limit })
        : await runsRepository.listVisibleTo(user.id, agentsApprovedByRole(user.role), limit);
    if (status?.length && user.role !== "admin") rows = rows.filter((r) => status.includes(r.status));
    res.json({ runs: await withRequesters(rows) });
  }),
);

runsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await runsRepository.findById(uuidParam(req.params.id, "Run"));
    if (!run) throw notFound("Run");
    if (!canViewRun(user, { requestedBy: run.requested_by, currentAgent: run.current_agent })) throw forbidden("You cannot view this run");

    const [steps, approvals, [view]] = await Promise.all([
      runsRepository.listSteps(run.id),
      approvalsRepository.list({ runId: run.id, limit: 50 }),
      withRequesters([run]),
    ]);
    res.json({ run: view, steps: steps.map(toRunStepView), approvals: await toApprovalViews(approvals, user) });
  }),
);

// after: an event id, or "turn" for the start of the current turn (after the last "done").
const eventsQuery = z.object({ after: z.union([z.literal("turn"), z.coerce.number().int().min(0)]).default(0) }).strict();

// GET /runs/:id/events?after=<event id>: the run's stored events after that id, then live until
// the current turn ends (SSE with event ids). Used to reconnect after a dropped stream, or to
// watch a run another client started.
runsRouter.get(
  "/:id/events",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await runsRepository.findById(uuidParam(req.params.id, "Run"));
    if (!run) throw notFound("Run");
    if (!canViewRun(user, { requestedBy: run.requested_by, currentAgent: run.current_agent })) throw forbidden("You cannot view this run");
    const { after } = parseOrThrow(eventsQuery, req.query);
    await streamRunEvents(req, res, run.id, after === "turn" ? await supabaseRunEventStore.lastIdOf(run.id, "done") : after);
  }),
);

// POST /runs/:id/stop: the requester stops their running turn (VS Code Stop). The run ends as
// INTERRUPTED and the conversation continues with the next message.
runsRouter.post(
  "/:id/stop",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await runsRepository.findById(uuidParam(req.params.id, "Run"));
    if (!run) throw notFound("Run");
    if (!canStopRun(user, { requestedBy: run.requested_by })) throw forbidden("Only the developer who started this run can stop it");
    res.status(202).json({ result: await stopRun(run, user, req.requestId) });
  }),
);
