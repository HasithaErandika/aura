import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { enumList, parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { agentTurnLimit } from "../../middleware/limits.js";
import { currentUser } from "../../middleware/auth.js";
import { canDecide, canViewRun, resolveApprover } from "../policy/policy.js";
import { runsRepository } from "../runs/runs.repository.js";
import { streamRunEvents } from "../orchestration/follow-http.js";
import { RunEventWriter, supabaseRunEventStore } from "../orchestration/run-events.js";
import { enqueueTurn, jobUser } from "../orchestration/turn-jobs.js";
import { approvalsRepository } from "./approvals.repository.js";
import { decide, expireOverdue, toApprovalView, toApprovalViews } from "./approvals.service.js";
import { APPROVAL_STATUSES, DECISIONS } from "./approvals.types.js";

export const approvalsRouter = Router();

const listQuerySchema = z
  .object({
    status: enumList(APPROVAL_STATUSES),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

// GET /approvals: the inbox. Admins see every request (read only); others see requests their
// role must decide plus questions on their own runs.
approvalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await expireOverdue();
    const { status, limit } = parseOrThrow(listQuerySchema, req.query);
    const rows =
      user.role === "admin"
        ? await approvalsRepository.list({ status, limit })
        : await approvalsRepository.listForUser(user.id, user.role, status, limit);
    res.json({ approvals: await toApprovalViews(rows, user) });
  }),
);

approvalsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await expireOverdue();
    const row = await approvalsRepository.findById(uuidParam(req.params.id, "Approval request"));
    if (!row) throw notFound("Approval request");
    const scope = resolveApprover(row.producing_agent, row.requested_by);
    if (user.role !== "admin" && !canDecide(user, scope) && row.requested_by !== user.id) {
      throw forbidden("You cannot view this approval request");
    }
    const run = await runsRepository.findById(row.run_id);
    res.json({ approval: await toApprovalView(row, user), run: run ? { id: run.id, title: run.title, status: run.status, threadId: run.thread_id } : null });
  }),
);

const decideSchema = z
  .object({
    decision: z.enum(DECISIONS),
    answer: z.string().trim().max(4000).optional(),
    reason: z.string().trim().max(4000).optional(),
    snapshotHash: z.string().length(64).optional(),
  })
  .strict();

// POST /approvals/:id/decide: records the human decision (FR-APPR-2/3), queues the resume of the
// suspended run as a background job and streams the continuation back as SSE. The decision is
// committed before anything is queued, so a dropped connection never loses the record or the run.
approvalsRouter.post(
  "/:id/decide",
  agentTurnLimit,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const approvalId = uuidParam(req.params.id, "Approval request");
    const body = parseOrThrow(decideSchema, req.body);

    const { approval, resumeData } = await decide({
      approvalId,
      user,
      decision: body.decision,
      answer: body.answer ?? null,
      reason: body.reason ?? null,
      snapshotHash: body.snapshotHash ?? null,
      requestId: req.requestId,
    });

    const run = await runsRepository.findById(approval.run_id);
    if (!run) throw notFound("Run");
    if (!canViewRun(user, { requestedBy: run.requested_by, currentAgent: run.current_agent }) && user.role !== approval.required_role) {
      throw forbidden("You cannot resume this run");
    }

    // This continuation's events start after everything the run already streamed.
    const afterId = await supabaseRunEventStore.lastId(run.id);
    const events = new RunEventWriter(run.id);
    events.send("decision", { approvalId: approval.id, status: approval.status, decision: body.decision });
    await events.flush();
    await enqueueTurn({
      kind: "resume",
      runId: run.id,
      runtimeRunId: approval.runtime_run_id,
      toolCallId: approval.tool_call_id,
      resumeData,
      decision: { approvalId: approval.id, decision: body.decision, userId: user.id, role: user.role, decidedAt: approval.decided_at ?? new Date().toISOString() },
      requestId: req.requestId,
      user: jobUser(user),
    });
    await streamRunEvents(req, res, run.id, afterId);
  }),
);
