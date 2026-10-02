import { writeAudit } from "../audit/audit.service.js";
import { bridgeHub } from "../bridge/hub.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { conflict } from "../../lib/http/errors.js";
import { runsRepository } from "../runs/runs.repository.js";
import type { RunRow } from "../runs/runs.types.js";
import { RunEventWriter } from "./run-events.js";
import { STOPPED_MESSAGE } from "./run-stream.service.js";
import { stopTurn } from "./turn-jobs.js";

// Stop (the VS Code panel's Stop button, plan §3): cancels the tool call running on the
// developer's machine, refuses the run's next ones, and ends the turn as INTERRUPTED. The
// conversation stays open; the next message continues it.
//
// A turn is aborted only in the API process that runs it. With one API process (today, and what
// the bridge needs anyway) that is always this one.

export type StopResult = "stopped" | "dequeued";

export async function stopRun(run: RunRow, user: Pick<AuthedUser, "id" | "role">, requestId: string): Promise<StopResult> {
  if (run.status !== "PENDING" && run.status !== "RUNNING") throw conflict("This run isn't running.");

  const cancelledCalls = bridgeHub.stopRun(run.id);
  let result: StopResult;
  if (stopTurn(run.id)) {
    // The turn's own error handling records INTERRUPTED and ends its event stream.
    result = "stopped";
  } else if (run.status === "PENDING") {
    // Still queued: end it here; the job skips it when it is picked up (turn-jobs.ts).
    await runsRepository.update(run.id, { status: "INTERRUPTED", last_error: STOPPED_MESSAGE, finished_at: new Date().toISOString() });
    const writer = new RunEventWriter(run.id);
    writer.send("error", { message: STOPPED_MESSAGE });
    writer.send("done", { runId: run.id, status: "INTERRUPTED", approvalId: null });
    await writer.flush();
    result = "dequeued";
  } else {
    throw conflict("This run is handled by another AURA API process and can't be stopped from here.");
  }

  await writeAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "run.stopped",
    entityType: "workflow_run",
    entityId: run.id,
    requestId,
    metadata: { result, cancelledCalls },
  });
  return result;
}
