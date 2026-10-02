import WebSocket from "ws";
import { BRIDGE_PROTOCOL_VERSION, READ_ONLY_OPS, parseServerMessage, type BridgeArgs, type BridgeOp, type ClientMessage, type ToolRequestMessage } from "@aura/bridge";
import { afterEditCommands, isCommit, runBeforeCommit, type HookRunner } from "./hooks.js";
import { describeRequest, ruleFor, type PermissionPolicy } from "./permissions.js";
import { EMPTY_SETTINGS, type Hooks } from "./project-settings.js";
import { ExecutorError, type WorkspaceExecutor } from "./executor.js";

// The extension's end of the bridge (ADR-4): fetches a ticket, opens the WebSocket to apps/api,
// and answers each tool request after the permission check. Reconnects with backoff until
// stopped. No VS Code API here: the prompt, the log and the status are passed in.

export type Approval = "once" | "session" | "project" | "deny";
export type BridgeState = "disconnected" | "connecting" | "connected";

export interface BridgeClientOptions {
  apiUrl: string;
  token: () => Promise<string | undefined>;
  executor: WorkspaceExecutor;
  policy: PermissionPolicy;
  workspaceName: string;
  ask: (question: string, detail: string) => Promise<Approval>;
  log: (line: string) => void;
  // The project's hooks (.aura/settings.json), read when a request arrives.
  hooks?: () => Hooks;
  // "Allow for this project": saves the rule to .aura/settings.local.json.
  allowForProject?: (rule: string) => Promise<void>;
  onState?: (state: BridgeState) => void;
  fetchImpl?: typeof fetch;
}

const MAX_BACKOFF_MS = 30_000;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempts = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly running = new Map<string, { runId: string; controller: AbortController }>();

  constructor(private readonly options: BridgeClientOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const { controller } of this.running.values()) controller.abort();
    this.running.clear();
    this.ws?.close(1000, "stopped");
    this.ws = null;
    this.options.onState?.("disconnected");
  }

  private async open(): Promise<void> {
    this.options.onState?.("connecting");
    const token = await this.options.token();
    if (!token) {
      this.options.log("Not signed in. Run 'AURA: Sign In'.");
      this.stop();
      return;
    }
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let ticket: string;
    try {
      const res = await fetchImpl(`${this.options.apiUrl}/bridge/tickets`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (res.status === 401 || res.status === 403) {
        this.options.log(`AURA refused the connection (${res.status}). Only developers can connect; check your access token.`);
        this.stop();
        return;
      }
      if (!res.ok) throw new Error(`ticket request failed (${res.status})`);
      ticket = ((await res.json()) as { ticket: string }).ticket;
    } catch (error) {
      this.options.log(`Can't reach AURA at ${this.options.apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      this.retry();
      return;
    }

    const url = `${this.options.apiUrl.replace(/^http/, "ws")}/bridge?ticket=${encodeURIComponent(ticket)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on("open", () => {
      this.attempts = 0;
      this.send({ type: "hello", protocol: BRIDGE_PROTOCOL_VERSION, client: "vscode", workspace: this.options.workspaceName });
      this.options.onState?.("connected");
      this.options.log(`Connected to AURA (${this.options.workspaceName}).`);
    });
    ws.on("message", (raw) => void this.handle(raw.toString()));
    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      this.options.log(`Disconnected from AURA (${code}${reason.length ? ` ${reason.toString()}` : ""}).`);
      if (code === 4000) {
        // Another VS Code window took over; don't fight it.
        this.stop();
        return;
      }
      this.retry();
    });
    ws.on("error", (error) => this.options.log(`Connection error: ${error.message}`));
  }

  private retry(): void {
    if (this.stopped) return;
    this.options.onState?.("connecting");
    const delay = Math.min(1000 * 2 ** this.attempts++, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => void this.open(), delay);
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private async handle(raw: string): Promise<void> {
    const message = parseServerMessage(raw);
    if (!message) return;
    if (message.type === "run.cancel") {
      this.running.get(message.callId)?.controller.abort();
      return;
    }
    if (message.type === "tool.request") await this.execute(message);
  }

  // Stop: kills what this run is doing on this machine right now, without waiting for the cloud.
  cancelRun(runId: string): number {
    let cancelled = 0;
    for (const { runId: id, controller } of this.running.values()) {
      if (id === runId) {
        controller.abort();
        cancelled++;
      }
    }
    return cancelled;
  }

  // Exported for tests through executeRequest.
  async execute(request: ToolRequestMessage): Promise<void> {
    const outcome = await executeRequest(request, this.options, (controller) => this.running.set(request.callId, { runId: request.runId, controller }));
    this.running.delete(request.callId);
    this.send(outcome.ok ? { type: "tool.result", callId: request.callId, ok: true, value: outcome.value } : { type: "tool.result", callId: request.callId, ok: false, error: outcome.error });
  }
}

export type RequestOutcome = { ok: true; value: unknown } | { ok: false; error: { code: ExecutorError["code"]; message: string } };

// Permission check → (ask) → run. Pure enough to test without a socket.
export async function executeRequest(
  request: ToolRequestMessage,
  options: Pick<BridgeClientOptions, "executor" | "policy" | "ask" | "log" | "hooks" | "allowForProject">,
  track?: (controller: AbortController) => void,
): Promise<RequestOutcome> {
  const op = request.op as BridgeOp;
  const args = request.args as BridgeArgs<BridgeOp>;
  const question = describeRequest(op, args);
  const decision = options.policy.decide(op, args, request.readOnly ? "plan" : undefined);

  if (decision.kind === "deny") {
    options.log(`✗ Refused: ${question} (${decision.reason})`);
    return { ok: false, error: { code: "denied", message: `Refused by AURA's built-in rules: ${decision.reason}.` } };
  }
  if (decision.kind === "ask") {
    const answer = await options.ask(question, `An AURA agent wants to do this in your workspace (${decision.reason}).`);
    if (answer === "deny") {
      options.log(`✗ Denied by you: ${question}`);
      return { ok: false, error: { code: "denied", message: "The developer refused this action." } };
    }
    if (answer === "session") options.policy.rememberForSession(op, args);
    if (answer === "project") {
      options.policy.rememberForSession(op, args);
      await options.allowForProject?.(ruleFor(op, args)).catch((error: unknown) => options.log(`Couldn't save the rule: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  const hooks = options.hooks?.() ?? EMPTY_SETTINGS.hooks;
  const controller = new AbortController();
  track?.(controller);
  // Hooks run as commands in the workspace; built-in and project denies still apply.
  const runHook: HookRunner = async (command) => {
    const check = options.policy.decide("sandbox.exec", { command });
    if (check.kind === "deny") return { exitCode: 126, output: `Refused: ${check.reason}` };
    const r = await options.executor.run("sandbox.exec", { command }, controller.signal);
    options.log(`${r.exitCode === 0 ? "✓" : "✗"} Hook: ${command} → exit ${r.exitCode}`);
    return { exitCode: r.exitCode, output: `${r.stdout}\n${r.stderr}`.trim() };
  };

  try {
    if (isCommit(op, args)) {
      const gate = await runBeforeCommit(hooks, runHook);
      if (!gate.ok) {
        options.log(`✗ ${question}: a beforeCommit hook failed`);
        return { ok: false, error: { code: "failed", message: gate.message } };
      }
    }
    const value = await options.executor.run(op, args, controller.signal);
    for (const command of afterEditCommands(hooks, op, args)) await runHook(command).catch((error: unknown) => options.log(`✗ Hook: ${command}: ${error instanceof Error ? error.message : String(error)}`));
    if (!READ_ONLY_OPS.includes(op)) {
      const exit = op === "sandbox.exec" ? ` → exit ${(value as { exitCode: number }).exitCode}` : "";
      options.log(`✓ ${question}${exit}`);
    }
    return { ok: true, value };
  } catch (error) {
    const e = error instanceof ExecutorError ? error : new ExecutorError("failed", error instanceof Error ? error.message : String(error));
    // A read finding nothing is normal (agents probe for files); only show real failures.
    if (!(READ_ONLY_OPS.includes(op) && e.code === "not_found")) options.log(`✗ ${question}: ${e.message}`);
    return { ok: false, error: { code: e.code, message: e.message } };
  }
}
