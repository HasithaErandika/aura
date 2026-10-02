// The AURA bridge protocol (ADR-4, docs/plans/aura-vscode-agents.md §5).
//
// The agent loop runs in the cloud; files and commands live on the developer's machine. When an
// agent needs one, the runtime asks apps/api, apps/api sends a `tool.request` over the developer's
// WebSocket, and the AURA VS Code extension answers with a `tool.result` after its own permission
// check. The extension only ever talks to apps/api.
//
//   runtime ──HTTP──▶ apps/api ──WebSocket──▶ VS Code extension
//           ◀────────          ◀──────────── (tool.result)

export const BRIDGE_PROTOCOL_VERSION = 2;

// Every operation the cloud can ask the extension to perform. Paths are relative to the open
// workspace folder; the extension refuses anything that resolves outside it.
export const BRIDGE_OPS = [
  "fs.readFile",
  "fs.writeFile",
  "fs.appendFile",
  "fs.deleteFile",
  "fs.copyFile",
  "fs.moveFile",
  "fs.mkdir",
  "fs.rmdir",
  "fs.readdir",
  "fs.exists",
  "fs.stat",
  "fs.grep",
  "sandbox.exec",
  // Background processes (dev servers, long test runs): start, read output, stop.
  "proc.spawn",
  "proc.read",
  "proc.kill",
  "proc.list",
] as const;
export type BridgeOp = (typeof BRIDGE_OPS)[number];

// Operations that change nothing on the developer's machine.
export const READ_ONLY_OPS: readonly BridgeOp[] = ["fs.readFile", "fs.readdir", "fs.exists", "fs.stat", "fs.grep", "proc.read", "proc.list"];

export interface FsEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
}

export interface FsStat {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface GrepMatch {
  line: number; // 1-based
  column: number; // 0-based, UTF-16
  text: string;
  before?: string[];
  after?: string[];
}

export interface GrepFile {
  path: string; // relative to the search root, POSIX separators
  matches: GrepMatch[];
}

export interface ProcessInfo {
  pid: string;
  command: string;
  running: boolean;
  exitCode?: number;
}

// Output since `offset` (characters already read), so polling never resends what was seen.
export interface ProcessOutput extends ProcessInfo {
  stdout: string;
  stderr: string;
  stdoutOffset: number;
  stderrOffset: number;
}

// Arguments and results per operation. File contents travel as UTF-8 text or base64.
export interface BridgeOpMap {
  "fs.readFile": { args: { path: string; encoding?: "utf8" | "base64" }; result: { content: string; encoding: "utf8" | "base64" } };
  "fs.writeFile": { args: { path: string; content: string; encoding?: "utf8" | "base64"; overwrite?: boolean }; result: null };
  "fs.appendFile": { args: { path: string; content: string }; result: null };
  "fs.deleteFile": { args: { path: string; force?: boolean }; result: null };
  "fs.copyFile": { args: { src: string; dest: string; overwrite?: boolean }; result: null };
  "fs.moveFile": { args: { src: string; dest: string; overwrite?: boolean }; result: null };
  "fs.mkdir": { args: { path: string; recursive?: boolean }; result: null };
  "fs.rmdir": { args: { path: string; recursive?: boolean; force?: boolean }; result: null };
  "fs.readdir": { args: { path: string; recursive?: boolean }; result: { entries: FsEntry[] } };
  "fs.exists": { args: { path: string }; result: { exists: boolean } };
  "fs.stat": { args: { path: string }; result: FsStat };
  "fs.grep": {
    args: { pattern: string; path: string; caseSensitive?: boolean; includeHidden?: boolean; maxCountPerFile?: number; maxTotalMatches?: number; contextLines?: number };
    result: { files: GrepFile[]; truncated: boolean };
  };
  "sandbox.exec": { args: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }; result: ExecResult };
  "proc.spawn": { args: { command: string; cwd?: string; timeoutMs?: number }; result: ProcessInfo };
  "proc.read": { args: { pid: string; stdoutOffset?: number; stderrOffset?: number }; result: ProcessOutput };
  "proc.kill": { args: { pid: string }; result: { killed: boolean } };
  "proc.list": { args: Record<string, never>; result: { processes: ProcessInfo[] } };
}

export type BridgeArgs<O extends BridgeOp> = BridgeOpMap[O]["args"];
export type BridgeResultValue<O extends BridgeOp> = BridgeOpMap[O]["result"];

// Why a call didn't produce a result.
export type BridgeErrorCode =
  | "denied" // the developer or a rule refused it
  | "outside_workspace" // the path resolves outside the open folder
  | "not_found"
  | "already_exists"
  | "timeout"
  | "not_connected" // no extension is connected for this developer
  | "cancelled"
  | "invalid"
  | "failed";

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}

// ── Messages: cloud → extension ────────────────────────────────────────────────────────────────

export interface ToolRequestMessage<O extends BridgeOp = BridgeOp> {
  type: "tool.request";
  callId: string;
  runId: string;
  op: O;
  args: BridgeArgs<O>;
  timeoutMs: number;
}

export interface CancelMessage {
  type: "run.cancel";
  callId: string;
}

export interface WelcomeMessage {
  type: "welcome";
  protocol: number;
  userId: string;
}

export type ServerMessage = ToolRequestMessage | CancelMessage | WelcomeMessage;

// ── Messages: extension → cloud ────────────────────────────────────────────────────────────────

export interface HelloMessage {
  type: "hello";
  protocol: number;
  client: string;
  workspace: string;
}

export type ToolResultMessage =
  | { type: "tool.result"; callId: string; ok: true; value: unknown }
  | { type: "tool.result"; callId: string; ok: false; error: BridgeError };

export type ClientMessage = HelloMessage | ToolResultMessage;

// ── Parsing (both sides receive untrusted JSON) ────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown, max = 200): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

export function isBridgeOp(v: unknown): v is BridgeOp {
  return typeof v === "string" && (BRIDGE_OPS as readonly string[]).includes(v);
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  if (m.type === "tool.request" && nonEmpty(m.callId) && nonEmpty(m.runId) && isBridgeOp(m.op) && isObject(m.args) && typeof m.timeoutMs === "number") {
    return m as unknown as ToolRequestMessage;
  }
  if (m.type === "run.cancel" && nonEmpty(m.callId)) return { type: "run.cancel", callId: m.callId };
  if (m.type === "welcome" && typeof m.protocol === "number" && nonEmpty(m.userId)) return { type: "welcome", protocol: m.protocol, userId: m.userId };
  return null;
}

const ERROR_CODES: readonly BridgeErrorCode[] = ["denied", "outside_workspace", "not_found", "already_exists", "timeout", "not_connected", "cancelled", "invalid", "failed"];

export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  if (m.type === "hello" && typeof m.protocol === "number" && nonEmpty(m.client) && typeof m.workspace === "string") {
    return { type: "hello", protocol: m.protocol, client: m.client, workspace: m.workspace.slice(0, 500) };
  }
  if (m.type === "tool.result" && nonEmpty(m.callId)) {
    if (m.ok === true) return { type: "tool.result", callId: m.callId, ok: true, value: m.value ?? null };
    if (m.ok === false && isObject(m.error) && typeof m.error.message === "string") {
      const code = (ERROR_CODES as readonly string[]).includes(String(m.error.code)) ? (m.error.code as BridgeErrorCode) : "failed";
      return { type: "tool.result", callId: m.callId, ok: false, error: { code, message: m.error.message.slice(0, 2000) } };
    }
  }
  return null;
}

// Output the extension sends back is capped so one command can't flood the model's context.
export const MAX_OUTPUT_CHARS = 30_000;
// Covers the developer deciding on a prompt plus the operation. Kept under Node fetch's 5-minute
// response-headers limit on the runtime → API call; longer commands need streamed progress (V2).
export const DEFAULT_TIMEOUT_MS = 270_000;
export const MAX_TIMEOUT_MS = 30 * 60_000;
