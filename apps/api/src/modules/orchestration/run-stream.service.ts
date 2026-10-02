import type { AuthedUser } from "../../lib/auth/user.js";
import { sha256 } from "../../lib/hash.js";
import { errorMessage, logger } from "../../lib/logger.js";
import { createApprovalRequest, toGateView } from "../approvals/index.js";
import { writeAudit, type AuditEvent } from "../audit/index.js";
import { canDecide, delegatedAgentFromTool, gateInfoForPause, resolveApprover } from "../policy/index.js";
import { runsRepository, type NewRunStep, type RunRow, type RunStatus } from "../runs/index.js";
import {
  DECISION_CONTEXT_KEY,
  RUN_CONTEXT_KEY,
  SETTINGS_CONTEXT_KEY,
  runtimeClient,
  type AskUserSuspendPayload,
  type RuntimeChunk,
  type RuntimeDecision,
  type RuntimeRunContext,
} from "../runtime/index.js";
import { turnSettings, type TurnSettings } from "../settings/index.js";
import type { EventSink } from "./run-events.js";
import { currentProjectId } from "../projects/index.js";

const PREVIEW_CHARS = 4000;
const SUMMARY_CHARS = 4000;
const STREAM_ENDED = "Runtime stream ended unexpectedly";

export const STOPPED_MESSAGE = "Stopped. Send a message to continue.";

export interface TurnOutcome {
  status: RunStatus;
  approvalId: string | null;
}

interface StreamContext {
  run: RunRow;
  viewer: AuthedUser;
  writer: EventSink;
  requestId: string;
  settings: TurnSettings;
  stop?: AbortSignal;
}

type Data = Record<string, unknown>;

export function preview(value: unknown, max = PREVIEW_CHARS): unknown {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}...` : value;
  if (value && typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length <= max ? value : { truncated: true, preview: text.slice(0, max) };
  }
  return value;
}

// The model that answered a turn, as provider/model, from the runtime's finish chunk.
export function modelFromFinish(payload: Data | undefined): string | null {
  const response = payload?.response as { modelId?: unknown; modelMetadata?: { modelProvider?: unknown } } | undefined;
  if (typeof response?.modelId !== "string" || !response.modelId) return null;
  const provider = typeof response.modelMetadata?.modelProvider === "string" ? response.modelMetadata.modelProvider.split(".")[0] : "";
  // Groq serves openai/gpt-oss-120b: the provider, not the model's maker, is who saw the data.
  return provider && !response.modelId.startsWith(`${provider}/`) ? `${provider}/${response.modelId}` : response.modelId;
}

export function runtimeErrorMessage(payload: Data | undefined): string {
  const inner = payload?.error ?? payload;
  if (inner && typeof inner === "object" && typeof (inner as { message?: unknown }).message === "string") return (inner as { message: string }).message;
  return errorMessage(inner ?? "runtime error");
}

const dataOf = (chunk: RuntimeChunk): Data => ((chunk as { data?: Data }).data ?? {}) as Data;
const toolOf = (chunk: RuntimeChunk) => ({ toolName: String(chunk.payload?.toolName ?? "tool"), toolCallId: String(chunk.payload?.toolCallId ?? "") });
const now = () => new Date().toISOString();

function runContext(run: RunRow, requestId: string, user: AuthedUser): RuntimeRunContext {
  return { runId: run.id, threadId: run.thread_id, requestId, userId: user.id, role: user.role };
}

function systemAudit(event: Omit<AuditEvent, "actorId" | "actorRole">): Promise<void> {
  return writeAudit({ actorId: null, actorRole: null, ...event });
}

async function pipeRuntimeStream(context: StreamContext, stream: AsyncGenerator<RuntimeChunk>): Promise<TurnOutcome> {
  const { writer, viewer, requestId } = context;
  let run = context.run;
  let seq = await runsRepository.nextSeq(run.id);
  let assistantText = "";
  let currentAgent = run.current_agent;
  const involved = new Set(run.agents_involved ?? []);
  let outcome: TurnOutcome = { status: "RUNNING", approvalId: null };
  let finished = false;
  // provider/model ids that saw this turn's data (step 4.2), for the audit trail.
  const models = new Set<string>();
  const noteModels = (list: unknown) => {
    if (Array.isArray(list)) for (const m of list) if (typeof m === "string" && m.length <= 200) models.add(m);
  };

  // Steps are buffered and written at durable points so streaming never waits on the database.
  const buffered: NewRunStep[] = [];
  const step = (kind: NewRunStep["kind"], fields: Omit<NewRunStep, "runId" | "seq" | "kind"> = {}) => {
    buffered.push({ runId: run.id, seq: seq++, kind, ...fields });
  };
  const flushSteps = async () => {
    const rows = buffered.splice(0, buffered.length);
    await runsRepository.addSteps(rows).catch((error) => logger.error("could not persist run steps", { runId: run.id, count: rows.length, message: errorMessage(error) }));
  };
  const summary = () => assistantText.trim().slice(0, SUMMARY_CHARS) || run.output_summary;
  const emitText = (delta: string) => {
    assistantText += delta;
    writer.send("text", { delta });
  };

  const onSuspended = async (chunk: RuntimeChunk) => {
    const { toolName, toolCallId } = toolOf(chunk);
    if (toolName !== "ask_user") {
      step("suspended", { toolName, payload: { unsupported: true } });
      writer.send("error", { message: `Runtime suspended on unsupported tool ${toolName}` });
      return;
    }
    const runtimeRunId = chunk.runId ?? run.runtime_run_id;
    if (!runtimeRunId) {
      writer.send("error", { message: "Runtime suspended without a run id; cannot record the gate" });
      return;
    }
    const suspend = (chunk.payload?.suspendPayload ?? {}) as AskUserSuspendPayload;
    const scope = resolveApprover(currentAgent, run.requested_by);
    const snapshot = assistantText.trim() || null;
    const expiresAt = new Date(Date.now() + context.settings.approvalSlaHours * 3_600_000).toISOString();
    const approval = await createApprovalRequest({
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
      snapshotHash: sha256(`${snapshot ?? ""}\n${suspend.question}\n${JSON.stringify(suspend.options ?? [])}`),
      expiresAt,
    });
    run = await runsRepository.update(run.id, { status: "SUSPENDED_FOR_APPROVAL", runtime_run_id: runtimeRunId });
    step("suspended", { toolName, toolCallId, payload: { approvalId: approval.id, producingAgent: scope.producingAgent, requiredRole: scope.requiredRole } });
    await flushSteps();
    await systemAudit({ action: "approval.requested", entityType: "approval_request", entityId: approval.id, requestId, metadata: { runId: run.id, producingAgent: scope.producingAgent, requiredRole: scope.requiredRole, models: [...models] } });
    outcome = { status: "SUSPENDED_FOR_APPROVAL", approvalId: approval.id };
    writer.send("gate", {
      approvalId: approval.id,
      runId: run.id,
      producingAgent: scope.producingAgent,
      gate: toGateView(gateInfoForPause(scope.producingAgent, suspend.options)),
      requiredRole: scope.requiredRole,
      question: suspend.question,
      options: suspend.options ?? [],
      selectionMode: suspend.selectionMode ?? null,
      snapshot,
      expiresAt,
      canDecide: canDecide(viewer, scope),
    });
  };

  const onGateway = async (data: Data) => {
    noteModels(data.models);
    step("progress", { payload: { source: "gateway", ...data } });
    writer.send("progress", { source: "gateway", ...data });
    const audit = { entityType: "workflow_run", entityId: run.id, requestId };
    if (data.outcome === "blocked") {
      await systemAudit({ ...audit, action: "gateway.blocked", metadata: { tool: data.tool, mode: data.mode, reason: data.reason, message: data.message, approvalId: data.approvalId ?? null } });
    }
    if (Array.isArray(data.findings) && data.findings.length) {
      await systemAudit({ ...audit, action: "gateway.untrusted_content", metadata: { tool: data.tool, mode: data.mode, outcome: data.outcome, findings: preview(data.findings) } });
    }
    if (data.reason === "loop_guard") {
      run = await runsRepository.update(run.id, { status: "HALTED_LOOP_GUARD", last_error: typeof data.message === "string" ? data.message : null });
      outcome = { status: "HALTED_LOOP_GUARD", approvalId: null };
      await systemAudit({ ...audit, action: "run.halted_loop_guard", metadata: { tool: data.tool, mode: data.mode, message: data.message } });
    }
  };

  const onFinish = async (chunk: RuntimeChunk) => {
    finished = true;
    const answered = modelFromFinish(chunk.payload);
    if (answered) noteModels([answered]);
    if (outcome.status === "RUNNING") {
      step("finish", { payload: { usage: preview(chunk.payload?.usage), reason: chunk.payload?.finishReason ?? null } });
      run = await runsRepository.update(run.id, { status: "SUCCEEDED", output_summary: summary(), finished_at: now() });
      outcome = { status: "SUCCEEDED", approvalId: null };
    } else if (outcome.status === "HALTED_LOOP_GUARD") {
      run = await runsRepository.update(run.id, { output_summary: summary(), finished_at: now() });
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
          if (delta) emitText(delta);
          break;
        }
        case "tool-call": {
          const { toolName, toolCallId } = toolOf(chunk);
          const delegated = delegatedAgentFromTool(toolName);
          if (delegated && (delegated !== currentAgent || !involved.has(delegated))) {
            currentAgent = delegated;
            involved.add(delegated);
            run = await runsRepository.update(run.id, { current_agent: currentAgent, agents_involved: [...involved] });
          }
          step("tool-call", { toolName, toolCallId, payload: { args: preview(chunk.payload?.args) } });
          writer.send("tool", { phase: "call", toolName, toolCallId, args: chunk.payload?.args, agent: delegated });
          break;
        }
        case "tool-result": {
          const { toolName, toolCallId } = toolOf(chunk);
          const result = preview(chunk.payload?.result);
          step("tool-result", { toolName, toolCallId, payload: { result } });
          writer.send("tool", { phase: "result", toolName, toolCallId, result, agent: delegatedAgentFromTool(toolName) });
          break;
        }
        case "tool-error": {
          const { toolName, toolCallId } = toolOf(chunk);
          const error = runtimeErrorMessage(chunk.payload);
          step("tool-error", { toolName, toolCallId, payload: { error } });
          writer.send("tool", { phase: "error", toolName, toolCallId, error });
          break;
        }
        case "tool-call-suspended":
          await onSuspended(chunk);
          break;
        case "error": {
          const message = runtimeErrorMessage(chunk.payload);
          step("error", { payload: { message } });
          run = await runsRepository.update(run.id, { status: "FAILED", last_error: message, finished_at: now() });
          outcome = { status: "FAILED", approvalId: null };
          finished = true;
          writer.send("error", { message });
          break;
        }
        case "data-architect-step": {
          const data = dataOf(chunk);
          step("progress", { payload: data });
          writer.send("progress", data);
          break;
        }
        case "data-task": {
          const data = { source: "task", ...dataOf(chunk) };
          step("progress", { payload: data });
          writer.send("progress", data);
          break;
        }
        // Gateway drafts join the reply so the chat and the approval snapshot both contain them.
        case "data-draft": {
          const data = dataOf(chunk);
          const markdown = typeof data.markdown === "string" ? data.markdown : "";
          if (!markdown) break;
          emitText(`${assistantText && !assistantText.endsWith("\n") ? "\n\n" : ""}${markdown}\n\n`);
          step("progress", { payload: { source: "draft", tool: data.tool, mode: data.mode, draftId: data.draftId ?? null, chars: markdown.length } });
          break;
        }
        case "data-gateway":
          await onGateway(dataOf(chunk));
          break;
        case "finish":
          await onFinish(chunk);
          break;
        default:
          break;
      }
    }
  } catch (error) {
    const stopped = context.stop?.aborted === true;
    const timedOut = error instanceof Error && error.name === "AbortError";
    const message = stopped ? STOPPED_MESSAGE : timedOut ? `Turn exceeded ${Math.round(context.settings.turnTimeoutMs / 60_000)} minutes and was stopped` : errorMessage(error);
    const status: RunStatus = stopped ? "INTERRUPTED" : "FAILED";
    if (stopped) logger.info("turn stopped", { runId: run.id });
    else logger.error("runtime stream failed", { runId: run.id, message });
    step("error", { payload: { message } });
    run = await runsRepository.update(run.id, { status, last_error: message, finished_at: now() }).catch((persistError) => {
      logger.error("could not persist run failure", { runId: run.id, message: errorMessage(persistError) });
      return run;
    });
    outcome = { status, approvalId: null };
    writer.send("error", { message });
    finished = true;
  }

  if (!finished && outcome.status === "RUNNING") {
    run = await runsRepository.update(run.id, { status: "FAILED", last_error: STREAM_ENDED, finished_at: now() });
    outcome = { status: "FAILED", approvalId: null };
    writer.send("error", { message: STREAM_ENDED });
  }

  if (assistantText.trim()) step("text", { payload: { text: assistantText.trim().slice(0, PREVIEW_CHARS) } });
  await flushSteps();
  await systemAudit({ action: "run.turn_ended", entityType: "workflow_run", entityId: run.id, requestId, metadata: { status: outcome.status, models: [...models], providers: [...new Set([...models].map((m) => m.split("/")[0]))] } });
  writer.send("done", { runId: run.id, status: outcome.status, approvalId: outcome.approvalId });
  return outcome;
}

export async function createTurnRun(input: { user: AuthedUser; agentId: string; threadId: string; message: string; requestId: string }): Promise<RunRow> {
  const run = await runsRepository.create({
    agentId: input.agentId,
    threadId: input.threadId,
    requestedBy: input.user.id,
    requestedByRole: input.user.role,
    title: input.message.slice(0, 120),
    inputSummary: input.message.slice(0, SUMMARY_CHARS),
    projectId: await currentProjectId().catch(() => null),
  });
  await writeAudit({ actorId: input.user.id, actorRole: input.user.role, action: "run.requested", entityType: "workflow_run", entityId: run.id, requestId: input.requestId, metadata: { agentId: input.agentId, threadId: input.threadId } });
  return run;
}

interface TurnInput {
  run: RunRow;
  user: AuthedUser;
  requestId: string;
  writer: EventSink;
  stop?: AbortSignal;
}

// Opens the runtime stream under the turn time limit and pipes it; a failed open fails the run.
async function runTurn(
  input: TurnInput,
  settings: TurnSettings,
  open: (signal: AbortSignal) => Promise<AsyncGenerator<RuntimeChunk>>,
  beforePipe: (run: RunRow) => Promise<RunRow> = async (run) => run,
): Promise<TurnOutcome> {
  const turn = new AbortController();
  const timer = setTimeout(() => turn.abort(), settings.turnTimeoutMs);
  const signal = input.stop ? AbortSignal.any([turn.signal, input.stop]) : turn.signal;
  try {
    let stream: AsyncGenerator<RuntimeChunk>;
    try {
      stream = await open(signal);
    } catch (error) {
      const message = errorMessage(error);
      await runsRepository.update(input.run.id, { status: "FAILED", last_error: message, finished_at: now() });
      input.writer.send("error", { message });
      input.writer.send("done", { runId: input.run.id, status: "FAILED", approvalId: null });
      return { status: "FAILED", approvalId: null };
    }
    const run = await beforePipe(input.run);
    return await pipeRuntimeStream({ run, viewer: input.user, writer: input.writer, requestId: input.requestId, settings, stop: input.stop }, stream);
  } finally {
    clearTimeout(timer);
  }
}

export async function startTurn(input: TurnInput & { message: string }): Promise<TurnOutcome> {
  const { run, user } = input;
  input.writer.send("run", { runId: run.id, runtimeRunId: null, status: run.status });
  const settings = await turnSettings(user.id);
  return runTurn(input, settings, (signal) =>
    runtimeClient.stream(
      run.agent_id,
      {
        messages: [{ role: "user", content: input.message }],
        memory: { thread: run.thread_id, resource: user.id },
        requestContext: { [RUN_CONTEXT_KEY]: runContext(run, input.requestId, user), [SETTINGS_CONTEXT_KEY]: settings.runtime },
      },
      signal,
    ),
  );
}

// Settings come from the requester, not the approver: the run is still the requester's work.
export async function resumeTurn(input: TurnInput & { runtimeRunId: string; toolCallId: string; resumeData: string; decision: RuntimeDecision }): Promise<TurnOutcome> {
  const { run, user } = input;
  const settings = await turnSettings(run.requested_by);
  const open = (signal: AbortSignal) =>
    runtimeClient.resumeStream(
      run.agent_id,
      {
        runId: input.runtimeRunId,
        toolCallId: input.toolCallId,
        resumeData: input.resumeData,
        memory: { thread: run.thread_id, resource: run.requested_by },
        requestContext: { [RUN_CONTEXT_KEY]: runContext(run, input.requestId, user), [DECISION_CONTEXT_KEY]: input.decision, [SETTINGS_CONTEXT_KEY]: settings.runtime },
      },
      signal,
    );
  return runTurn(input, settings, open, async (current) => {
    const resumed = await runsRepository.update(current.id, { status: "RUNNING" });
    const seq = await runsRepository.nextSeq(current.id);
    await runsRepository.addSteps([{ runId: current.id, seq, kind: "resumed", toolName: "ask_user", toolCallId: input.toolCallId, payload: { by: user.id, role: user.role } }]);
    input.writer.send("run", { runId: current.id, runtimeRunId: input.runtimeRunId, status: "RUNNING" });
    return resumed;
  });
}
