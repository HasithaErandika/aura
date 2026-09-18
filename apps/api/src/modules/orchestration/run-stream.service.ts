import { env } from "../../config/env.js";
import { sha256 } from "../../lib/hash.js";
import type { SseWriter } from "../../lib/http/sse.js";
import { errorMessage, logger } from "../../lib/logger.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { approvalsRepository } from "../approvals/approvals.repository.js";
import { canDecide, delegatedAgentFromTool, gateInfoForPause, resolveApprover } from "../policy/policy.js";
import { runsRepository } from "../runs/runs.repository.js";
import type { RunRow, RunStatus } from "../runs/runs.types.js";
import { runtimeClient } from "../runtime/runtime.client.js";
import type { AskUserSuspendPayload, RuntimeChunk } from "../runtime/runtime.types.js";

// Observes one runtime stream (a fresh turn or a resumed one) and mirrors what the
// Orchestrator decides to do into AURA's governance records:
//   - every tool call and result becomes a run step (the "progress" the UI shows),
//   - a delegation tells us which agent is currently producing output,
//   - an ask_user suspension becomes a durable approval request routed by policy,
//   - finish / error close the run.
// The sequence of those events is entirely the runtime's; nothing here assumes an order.

const TOOL_RESULT_PREVIEW_CHARS = 4000;

interface StreamContext {
  run: RunRow;
  viewer: AuthedUser;
  writer: SseWriter;
  requestId: string;
}

export interface TurnOutcome {
  status: RunStatus;
  approvalId: string | null;
}

function preview(value: unknown): unknown {
  if (typeof value === "string") return value.length > TOOL_RESULT_PREVIEW_CHARS ? `${value.slice(0, TOOL_RESULT_PREVIEW_CHARS)}...` : value;
  if (value && typeof value === "object") {
    const text = JSON.stringify(value);
    if (text.length <= TOOL_RESULT_PREVIEW_CHARS) return value;
    return { truncated: true, preview: text.slice(0, TOOL_RESULT_PREVIEW_CHARS) };
  }
  return value;
}

// Runtime error chunks carry { error: { message, name, stack } } or a plain string.
function runtimeErrorMessage(payload: Record<string, unknown> | undefined): string {
  const inner = payload?.error ?? payload;
  if (inner && typeof inner === "object" && typeof (inner as { message?: unknown }).message === "string") {
    return (inner as { message: string }).message;
  }
  return errorMessage(inner ?? "runtime error");
}

function isAskUserSuspension(chunk: RuntimeChunk): boolean {
  return chunk.type === "tool-call-suspended" && chunk.payload?.toolName === "ask_user";
}

export async function pipeRuntimeStream(context: StreamContext, stream: AsyncGenerator<RuntimeChunk>): Promise<TurnOutcome> {
  const { writer, viewer } = context;
  let run = context.run;
  let seq = await runsRepository.nextSeq(run.id);
  let assistantText = "";
  let currentAgent = run.current_agent;
  const involved = new Set(run.agents_involved ?? []);
  let outcome: TurnOutcome = { status: "RUNNING", approvalId: null };
  let finished = false;

  // Steps are buffered and written in one insert at each durable point (suspension, error,
  // end of turn) so forwarding the stream to the browser never waits on the database.
  type StepKind = "tool-call" | "tool-result" | "tool-error" | "text" | "suspended" | "resumed" | "error" | "finish" | "progress";
  const buffered: Parameters<typeof runsRepository.addSteps>[0] = [];
  const step = async (kind: StepKind, fields: { toolName?: string; toolCallId?: string; payload?: Record<string, unknown> }) => {
    buffered.push({ runId: run.id, seq: seq++, kind, ...fields });
  };
  const flushSteps = async () => {
    if (buffered.length === 0) return;
    const rows = buffered.splice(0, buffered.length);
    try {
      await runsRepository.addSteps(rows);
    } catch (error) {
      logger.error("could not persist run steps", { runId: run.id, count: rows.length, message: errorMessage(error) });
    }
  };

  try {
    for await (const chunk of stream) {
      if (chunk.runId && !run.runtime_run_id) {
        run = await runsRepository.update(run.id, { runtime_run_id: chunk.runId, status: "RUNNING" });
        writer.send("run", { runId: run.id, runtimeRunId: chunk.runId, status: run.status });
      }

      switch (chunk.type) {
        case "text-delta": {
          const delta = typeof chunk.payload?.text === "string" ? chunk.payload.text : "";
          if (delta) {
            assistantText += delta;
            writer.send("text", { delta });
          }
          break;
        }

        case "tool-call": {
          const toolName = String(chunk.payload?.toolName ?? "tool");
          const toolCallId = String(chunk.payload?.toolCallId ?? "");
          const delegated = delegatedAgentFromTool(toolName);
          if (delegated && (delegated !== currentAgent || !involved.has(delegated))) {
            currentAgent = delegated;
            involved.add(delegated);
            run = await runsRepository.update(run.id, { current_agent: currentAgent, agents_involved: Array.from(involved) });
          }
          await step("tool-call", { toolName, toolCallId, payload: { args: preview(chunk.payload?.args) } });
          writer.send("tool", { phase: "call", toolName, toolCallId, args: chunk.payload?.args, agent: delegated });
          break;
        }

        case "tool-result": {
          const toolName = String(chunk.payload?.toolName ?? "tool");
          const toolCallId = String(chunk.payload?.toolCallId ?? "");
          const result = chunk.payload?.result;
          await step("tool-result", { toolName, toolCallId, payload: { result: preview(result) } });
          writer.send("tool", { phase: "result", toolName, toolCallId, result: preview(result), agent: delegatedAgentFromTool(toolName) });
          break;
        }

        case "tool-error": {
          const toolName = String(chunk.payload?.toolName ?? "tool");
          const toolCallId = String(chunk.payload?.toolCallId ?? "");
          const error = runtimeErrorMessage(chunk.payload);
          await step("tool-error", { toolName, toolCallId, payload: { error } });
          writer.send("tool", { phase: "error", toolName, toolCallId, error });
          break;
        }

        case "tool-call-suspended": {
          if (!isAskUserSuspension(chunk)) {
            // Another suspending tool would need its own resume contract; surface it and stop.
            await step("suspended", { toolName: String(chunk.payload?.toolName ?? ""), payload: { unsupported: true } });
            writer.send("error", { message: `Runtime suspended on unsupported tool ${String(chunk.payload?.toolName)}` });
            break;
          }
          const suspend = (chunk.payload?.suspendPayload ?? {}) as AskUserSuspendPayload;
          const toolCallId = String(chunk.payload?.toolCallId ?? "");
          const runtimeRunId = chunk.runId ?? run.runtime_run_id;
          if (!runtimeRunId) {
            writer.send("error", { message: "Runtime suspended without a run id; cannot record the gate" });
            break;
          }
          const scope = resolveApprover(currentAgent, run.requested_by);
          const snapshot = assistantText.trim() || null;
          const snapshotHash = sha256(`${snapshot ?? ""}\n${suspend.question}\n${JSON.stringify(suspend.options ?? [])}`);
          const expiresAt = new Date(Date.now() + env.approvalSlaHours * 3_600_000).toISOString();
          const approval = await approvalsRepository.create({
            runId: run.id,
            threadId: run.thread_id,
            agentId: run.agent_id,
            runtimeRunId,
            toolCallId,
            producingAgent: scope.producingAgent,
            requiredRole: scope.requiredRole,
            requestedBy: run.requested_by,
            question: suspend.question,
            options: suspend.options ?? null,
            selectionMode: suspend.selectionMode ?? null,
            snapshot,
            snapshotHash,
            expiresAt,
          });
          run = await runsRepository.update(run.id, { status: "SUSPENDED_FOR_APPROVAL", runtime_run_id: runtimeRunId });
          await step("suspended", {
            toolName: "ask_user",
            toolCallId,
            payload: { approvalId: approval.id, producingAgent: scope.producingAgent, requiredRole: scope.requiredRole },
          });
          await flushSteps();
          await writeAudit({
            actorId: null,
            actorRole: null,
            action: "approval.requested",
            entityType: "approval_request",
            entityId: approval.id,
            requestId: context.requestId,
            metadata: { runId: run.id, producingAgent: scope.producingAgent, requiredRole: scope.requiredRole },
          });
          outcome = { status: "SUSPENDED_FOR_APPROVAL", approvalId: approval.id };
          const gate = gateInfoForPause(scope.producingAgent, suspend.options);
          writer.send("gate", {
            approvalId: approval.id,
            runId: run.id,
            producingAgent: scope.producingAgent,
            gate: gate ? { number: gate.gate, name: gate.name, outcome: gate.outcome } : null,
            requiredRole: scope.requiredRole,
            question: suspend.question,
            options: suspend.options ?? [],
            selectionMode: suspend.selectionMode ?? null,
            snapshot,
            expiresAt,
            canDecide: canDecide(viewer, scope),
          });
          break;
        }

        case "error": {
          const message = runtimeErrorMessage(chunk.payload);
          await step("error", { payload: { message } });
          run = await runsRepository.update(run.id, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() });
          outcome = { status: "FAILED", approvalId: null };
          finished = true;
          writer.send("error", { message });
          break;
        }

        // A workflow-backed delegate tool (e.g. delegate_to_architect) relays its internal
        // step progress as a transient custom chunk into this same stream (Mastra's tool
        // `writer` API - see apps/agent-runtime/src/mastra/tools/delegate-tools.ts). Mirrored
        // as a run step exactly like a tool call, so the Run Console shows per-section
        // progress without a second tracking mechanism (docs/ARCHITECTURE.md section 6.3).
        case "data-architect-step": {
          const data = (chunk as unknown as { data?: Record<string, unknown> }).data ?? {};
          await step("progress", { payload: data });
          writer.send("progress", data);
          break;
        }

        // The Dev agent's Docker run and the Coding agent's CLI run relay their live
        // stdout/stderr the same way (writer.custom(), delegate-tools.ts) - each chunk is
        // `{ chunk: string }`. Mirrored into run_steps and the live stream exactly like
        // architect-step progress above, so a human watching Gate 4/5 execute sees real
        // output instead of silence for however many minutes the container runs.
        case "data-dev-output":
        case "data-code-output": {
          const data = (chunk as unknown as { data?: Record<string, unknown> }).data ?? {};
          await step("progress", { payload: { source: chunk.type === "data-dev-output" ? "dev" : "code", ...data } });
          writer.send("progress", { source: chunk.type === "data-dev-output" ? "dev" : "code", ...data });
          break;
        }

        case "finish": {
          finished = true;
          // An error chunk arrives before finish; only a still-running turn completes here.
          if (outcome.status === "RUNNING") {
            await step("finish", { payload: { usage: preview(chunk.payload?.usage), reason: chunk.payload?.finishReason ?? null } });
            run = await runsRepository.update(run.id, {
              status: "SUCCEEDED",
              output_summary: assistantText.trim().slice(0, 4000) || run.output_summary,
              finished_at: new Date().toISOString(),
            });
            outcome = { status: "SUCCEEDED", approvalId: null };
          }
          break;
        }

        default:
          break;
      }
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? `Turn exceeded ${Math.round(env.runTurnTimeoutMs / 60_000)} minutes and was stopped` : errorMessage(error);
    logger.error("runtime stream failed", { runId: run.id, message });
    try {
      await step("error", { payload: { message } });
      run = await runsRepository.update(run.id, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() });
    } catch (persistError) {
      logger.error("could not persist run failure", { runId: run.id, message: errorMessage(persistError) });
    }
    outcome = { status: "FAILED", approvalId: null };
    writer.send("error", { message });
    finished = true;
  }

  if (!finished && outcome.status === "RUNNING") {
    // Stream ended without a finish chunk (runtime dropped the connection).
    run = await runsRepository.update(run.id, { status: "FAILED", last_error: "Runtime stream ended unexpectedly", finished_at: new Date().toISOString() });
    outcome = { status: "FAILED", approvalId: null };
    writer.send("error", { message: "Runtime stream ended unexpectedly" });
  }

  if (assistantText.trim()) {
    await step("text", { payload: { text: assistantText.trim().slice(0, TOOL_RESULT_PREVIEW_CHARS) } });
  }
  await flushSteps();

  writer.send("done", { runId: run.id, status: outcome.status, approvalId: outcome.approvalId });
  return outcome;
}

export async function startTurn(input: {
  user: AuthedUser;
  agentId: string;
  threadId: string;
  message: string;
  requestId: string;
  writer: SseWriter;
}): Promise<TurnOutcome> {
  const run = await runsRepository.create({
    agentId: input.agentId,
    threadId: input.threadId,
    requestedBy: input.user.id,
    requestedByRole: input.user.role,
    title: input.message.slice(0, 120),
    inputSummary: input.message.slice(0, 4000),
  });
  await writeAudit({
    actorId: input.user.id,
    actorRole: input.user.role,
    action: "run.requested",
    entityType: "workflow_run",
    entityId: run.id,
    requestId: input.requestId,
    metadata: { agentId: input.agentId, threadId: input.threadId },
  });
  input.writer.send("run", { runId: run.id, runtimeRunId: null, status: run.status });

  const turn = new AbortController();
  const turnTimer = setTimeout(() => turn.abort(), env.runTurnTimeoutMs);
  let stream: AsyncGenerator<RuntimeChunk>;
  try {
    stream = await runtimeClient.stream(
      input.agentId,
      {
        messages: [{ role: "user", content: input.message }],
        memory: { thread: input.threadId, resource: input.user.id },
      },
      turn.signal,
    );
  } catch (error) {
    clearTimeout(turnTimer);
    const message = errorMessage(error);
    await runsRepository.update(run.id, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() });
    input.writer.send("error", { message });
    input.writer.send("done", { runId: run.id, status: "FAILED", approvalId: null });
    return { status: "FAILED", approvalId: null };
  }

  try {
    return await pipeRuntimeStream({ run, viewer: input.user, writer: input.writer, requestId: input.requestId }, stream);
  } finally {
    clearTimeout(turnTimer);
  }
}

export async function resumeTurn(input: {
  user: AuthedUser;
  run: RunRow;
  runtimeRunId: string;
  toolCallId: string;
  resumeData: string;
  requestId: string;
  writer: SseWriter;
}): Promise<TurnOutcome> {
  let run = input.run;
  const turn = new AbortController();
  const turnTimer = setTimeout(() => turn.abort(), env.runTurnTimeoutMs);
  let stream: AsyncGenerator<RuntimeChunk>;
  try {
    stream = await runtimeClient.resumeStream(
      run.agent_id,
      {
        runId: input.runtimeRunId,
        toolCallId: input.toolCallId,
        resumeData: input.resumeData,
        memory: { thread: run.thread_id, resource: run.requested_by },
      },
      turn.signal,
    );
  } catch (error) {
    clearTimeout(turnTimer);
    const message = errorMessage(error);
    run = await runsRepository.update(run.id, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() });
    input.writer.send("error", { message });
    input.writer.send("done", { runId: run.id, status: "FAILED", approvalId: null });
    return { status: "FAILED", approvalId: null };
  }

  run = await runsRepository.update(run.id, { status: "RUNNING" });
  await runsRepository.addStep({
    runId: run.id,
    seq: await runsRepository.nextSeq(run.id),
    kind: "resumed",
    toolName: "ask_user",
    toolCallId: input.toolCallId,
    payload: { by: input.user.id, role: input.user.role },
  });
  input.writer.send("run", { runId: run.id, runtimeRunId: input.runtimeRunId, status: "RUNNING" });

  try {
    return await pipeRuntimeStream({ run, viewer: input.user, writer: input.writer, requestId: input.requestId }, stream);
  } finally {
    clearTimeout(turnTimer);
  }
}
