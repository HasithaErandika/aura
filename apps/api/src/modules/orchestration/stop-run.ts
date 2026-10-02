import type { AuthedUser } from "../../lib/auth/user.js";
import { conflict } from "../../lib/http/errors.js";
import { writeAudit } from "../audit/index.js";
import { cancelBridgeCalls } from "../bridge/index.js";
import { runsRepository, type RunRow } from "../runs/index.js";
import { RunEventWriter } from "./run-events.js";
import { STOPPED_MESSAGE } from "./run-stream.service.js";
import { stopTurn } from "./turn-jobs.js";

export type StopResult = "stopped" | "dequeued";

// A turn can only be aborted by the API process running it.
export async function stopRun(run: RunRow, user: Pick<AuthedUser, "id" | "role">, requestId: string): Promise<StopResult> {
  if (run.status !== "PENDING" && run.status !== "RUNNING") throw conflict("This run isn't running.");

  const cancelledCalls = cancelBridgeCalls(run.id);
  let result: StopResult;
  if (stopTurn(run.id)) {
    result = "stopped";
  } else if (run.status === "PENDING") {
    await runsRepository.update(run.id, { status: "INTERRUPTED", last_error: STOPPED_MESSAGE, finished_at: new Date().toISOString() });
    const writer = new RunEventWriter(run.id);
    writer.send("error", { message: STOPPED_MESSAGE });
    writer.send("done", { runId: run.id, status: "INTERRUPTED", approvalId: null });
    await writer.flush();
    result = "dequeued";
  } else {
    throw conflict("This run is handled by another AURA API process and can't be stopped from here.");
  }

  await writeAudit({ actorId: user.id, actorRole: user.role, action: "run.stopped", entityType: "workflow_run", entityId: run.id, requestId, metadata: { result, cancelledCalls } });
  return result;
}
