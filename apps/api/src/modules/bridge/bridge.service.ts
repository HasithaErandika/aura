import { READ_ONLY_OPS } from "@aura/bridge";
import { logger } from "../../lib/logger.js";
import { writeAudit } from "../audit/index.js";
import { requireRun } from "../runs/index.js";
import { bridgeHub, type CallOutcome } from "./bridge.hub.js";
import type { BridgeCall } from "./bridge.schemas.js";

const COMMAND_OPS = new Set(["sandbox.exec", "proc.spawn"]);
const COMMAND_SUMMARY_CHARS = 300;

export function callSummary(call: Pick<BridgeCall, "op" | "args">): { op: string; path: unknown; command: string | null } {
  const args = Array.isArray(call.args.args) ? call.args.args : [];
  return {
    op: call.op,
    path: call.args.path ?? call.args.src ?? null,
    command: COMMAND_OPS.has(call.op) ? [call.args.command, ...args].join(" ").slice(0, COMMAND_SUMMARY_CHARS) : null,
  };
}

// Changes on a developer's machine go to the audit log; reads only to the server log.
export async function forwardCall(call: BridgeCall, requestId: string): Promise<CallOutcome> {
  const run = await requireRun(call.runId);
  const outcome = await bridgeHub.call(run.requested_by, run.id, call.op, call.args, call.timeoutMs, { readOnly: call.readOnly, worktree: call.worktree });
  const summary = callSummary(call);
  const error = outcome.ok ? null : outcome.error;
  logger.info("bridge call", { runId: run.id, ...summary, ok: outcome.ok, durationMs: outcome.durationMs, error: error?.code });
  if (!READ_ONLY_OPS.includes(call.op)) {
    await writeAudit({
      actorId: run.requested_by,
      actorRole: run.requested_by_role,
      action: "bridge.tool.call",
      entityType: "workflow_run",
      entityId: run.id,
      requestId,
      metadata: { ...summary, ok: outcome.ok, error, durationMs: outcome.durationMs },
    });
  }
  return outcome;
}

export function cancelBridgeCalls(runId: string): number {
  return bridgeHub.stopRun(runId);
}
