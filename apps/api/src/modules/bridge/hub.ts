import { randomUUID } from "node:crypto";
import {
  BRIDGE_PROTOCOL_VERSION,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  parseClientMessage,
  type BridgeError,
  type BridgeOp,
  type ServerMessage,
  type ToolResultMessage,
} from "@aura/bridge";

// The bridge hub (ADR-4): one WebSocket per developer's VS Code extension, and the tool calls the
// runtime sends to it. A call goes to the extension of the user who owns the run, waits for its
// tool.result and resolves with it, or with an error (not connected, timeout, disconnected).
// Pure: no Express, no ws, so it is tested with fake sockets. ws.ts wires it to the HTTP server.

export interface BridgeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface BridgeConnection {
  id: string;
  userId: string;
  socket: BridgeSocket;
  workspace: string | null;
  client: string | null;
  connectedAt: string;
}

export type CallOutcome = { ok: true; value: unknown; durationMs: number } | { ok: false; error: BridgeError; durationMs: number };

interface Pending {
  connectionId: string;
  resolve: (outcome: CallOutcome) => void;
  timer: NodeJS.Timeout;
  startedAt: number;
}

export class BridgeHub {
  private readonly byUser = new Map<string, BridgeConnection>();
  private readonly pending = new Map<string, Pending>();

  // A newer connection from the same user replaces the older one (one VS Code window drives agents).
  connect(userId: string, socket: BridgeSocket): BridgeConnection {
    const previous = this.byUser.get(userId);
    if (previous) {
      this.disconnect(previous.id);
      previous.socket.close(4000, "replaced by a newer connection");
    }
    const connection: BridgeConnection = { id: randomUUID(), userId, socket, workspace: null, client: null, connectedAt: new Date().toISOString() };
    this.byUser.set(userId, connection);
    this.send(connection, { type: "welcome", protocol: BRIDGE_PROTOCOL_VERSION, userId });
    return connection;
  }

  disconnect(connectionId: string): void {
    for (const [userId, connection] of this.byUser) {
      if (connection.id === connectionId) this.byUser.delete(userId);
    }
    for (const [callId, pending] of this.pending) {
      if (pending.connectionId === connectionId) this.settle(callId, { ok: false, error: { code: "not_connected", message: "VS Code disconnected before the call finished" } });
    }
  }

  // A message from an extension. Anything malformed is ignored.
  receive(connection: BridgeConnection, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) return;
    if (message.type === "hello") {
      connection.workspace = message.workspace;
      connection.client = message.client;
      return;
    }
    this.result(connection, message);
  }

  status(userId: string): { connected: false } | { connected: true; workspace: string | null; client: string | null; since: string } {
    const c = this.byUser.get(userId);
    return c ? { connected: true, workspace: c.workspace, client: c.client, since: c.connectedAt } : { connected: false };
  }

  call(userId: string, runId: string, op: BridgeOp, args: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CallOutcome> {
    const connection = this.byUser.get(userId);
    if (!connection) {
      return Promise.resolve({ ok: false, error: { code: "not_connected", message: "AURA for VS Code is not connected for this developer. Open VS Code and run 'AURA: Connect'." }, durationMs: 0 });
    }
    const limit = Math.min(Math.max(1000, timeoutMs), MAX_TIMEOUT_MS);
    const callId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.send(connection, { type: "run.cancel", callId });
        this.settle(callId, { ok: false, error: { code: "timeout", message: `VS Code did not answer within ${Math.round(limit / 1000)} s` } });
      }, limit);
      this.pending.set(callId, { connectionId: connection.id, resolve, timer, startedAt: Date.now() });
      this.send(connection, { type: "tool.request", callId, runId, op, args, timeoutMs: limit } as ServerMessage);
    });
  }

  get connectionCount(): number {
    return this.byUser.size;
  }

  private result(connection: BridgeConnection, message: ToolResultMessage): void {
    const pending = this.pending.get(message.callId);
    // Only the connection the call was sent to may answer it.
    if (!pending || pending.connectionId !== connection.id) return;
    this.settle(message.callId, message.ok ? { ok: true, value: message.value } : { ok: false, error: message.error });
  }

  private settle(callId: string, outcome: { ok: true; value: unknown } | { ok: false; error: BridgeError }): void {
    const pending = this.pending.get(callId);
    if (!pending) return;
    this.pending.delete(callId);
    clearTimeout(pending.timer);
    pending.resolve({ ...outcome, durationMs: Date.now() - pending.startedAt } as CallOutcome);
  }

  private send(connection: BridgeConnection, message: ServerMessage): void {
    try {
      connection.socket.send(JSON.stringify(message));
    } catch {
      this.disconnect(connection.id);
    }
  }
}

export const bridgeHub = new BridgeHub();
