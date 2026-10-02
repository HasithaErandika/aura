import type { Request, Response } from "express";
import type { AuthedUser } from "../../lib/auth/user.js";
import { SseWriter } from "../../lib/http/sse.js";
import type { ApprovalRow, Decision } from "../approvals/index.js";
import { followRun, RunEventWriter } from "./run-events.js";
import { supabaseRunEventStore } from "./run-events.repository.js";
import { createTurnRun } from "./run-stream.service.js";
import { enqueueTurn, jobUser } from "./turn-jobs.js";

// Disconnecting only stops the stream; the turn keeps running as a job.
export async function streamRunEvents(req: Request, res: Response, runId: string, afterId: number): Promise<void> {
  const writer = new SseWriter(req, res);
  await followRun({
    runId,
    afterId,
    target: {
      send: (id, event, data) => writer.send(event, data, id),
      comment: (text) => writer.comment(text),
      get isClosed() {
        return writer.isClosed;
      },
    },
  });
  writer.end();
}

export function lastEventIdOf(runId: string, event: string): Promise<number> {
  return supabaseRunEventStore.lastIdOf(runId, event);
}

export async function startTurnAndStream(req: Request, res: Response, input: { user: AuthedUser; agentId: string; threadId: string; message: string }): Promise<void> {
  const run = await createTurnRun({ ...input, requestId: req.requestId });
  await enqueueTurn({ kind: "start", runId: run.id, message: input.message, requestId: req.requestId, user: jobUser(input.user) });
  await streamRunEvents(req, res, run.id, 0);
}

export async function resumeAfterDecision(req: Request, res: Response, input: { approval: ApprovalRow; decision: Decision; resumeData: string; user: AuthedUser }): Promise<void> {
  const { approval, user } = input;
  const afterId = await supabaseRunEventStore.lastId(approval.run_id);
  const events = new RunEventWriter(approval.run_id);
  events.send("decision", { approvalId: approval.id, status: approval.status, decision: input.decision });
  await events.flush();
  await enqueueTurn({
    kind: "resume",
    runId: approval.run_id,
    runtimeRunId: approval.runtime_run_id,
    toolCallId: approval.tool_call_id,
    resumeData: input.resumeData,
    decision: { approvalId: approval.id, decision: input.decision, userId: user.id, role: user.role, decidedAt: approval.decided_at ?? new Date().toISOString() },
    requestId: req.requestId,
    user: jobUser(user),
  });
  await streamRunEvents(req, res, approval.run_id, afterId);
}
