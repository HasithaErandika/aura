import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../audit/index.js", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, errorMessage: (e: unknown) => String(e) }));

const { BridgeHub } = await import("./bridge.hub.js");
const { TicketStore } = await import("./bridge.tickets.js");
const { attachBridge } = await import("./bridge.ws.js");

function fakeSocket() {
  const sent: Record<string, unknown>[] = [];
  return { sent, closed: null as null | string, send: (d: string) => void sent.push(JSON.parse(d)), close(code?: number, reason?: string) { this.closed = `${code} ${reason}`; } };
}

describe("BridgeHub", () => {
  it("sends a tool request to the run owner's extension and resolves with its result", async () => {
    const hub = new BridgeHub();
    const socket = fakeSocket();
    const connection = hub.connect("u1", socket);
    expect(socket.sent[0]).toMatchObject({ type: "welcome", userId: "u1" });

    const call = hub.call("u1", "run-1", "fs.readFile", { path: "package.json" }, 5000);
    const request = socket.sent[1] as { type: string; callId: string; op: string; runId: string };
    expect(request).toMatchObject({ type: "tool.request", op: "fs.readFile", runId: "run-1" });
    hub.receive(connection, JSON.stringify({ type: "tool.result", callId: request.callId, ok: true, value: { content: "{}", encoding: "utf8" } }));
    expect(await call).toMatchObject({ ok: true, value: { content: "{}", encoding: "utf8" } });
  });

  it("answers not_connected when the developer has no extension open", async () => {
    expect(await new BridgeHub().call("u1", "run-1", "fs.stat", { path: "." })).toMatchObject({ ok: false, error: { code: "not_connected" } });
  });

  it("times out, and tells the extension to cancel", async () => {
    vi.useFakeTimers();
    try {
      const hub = new BridgeHub();
      const socket = fakeSocket();
      hub.connect("u1", socket);
      const call = hub.call("u1", "run-1", "sandbox.exec", { command: "npm", args: ["test"] }, 2000);
      vi.advanceTimersByTime(2001);
      expect(await call).toMatchObject({ ok: false, error: { code: "timeout" } });
      expect(socket.sent.at(-1)).toMatchObject({ type: "run.cancel" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails pending calls when the extension disconnects, and lets a newer window replace an older one", async () => {
    const hub = new BridgeHub();
    const first = fakeSocket();
    hub.connect("u1", first);
    const call = hub.call("u1", "run-1", "fs.readdir", { path: "." });
    const second = fakeSocket();
    hub.connect("u1", second);
    expect(await call).toMatchObject({ ok: false, error: { code: "not_connected" } });
    expect(first.closed).toMatch(/^4000/);
    expect(hub.status("u1")).toMatchObject({ connected: true });
  });

  it("ignores a result sent by a different connection", async () => {
    const hub = new BridgeHub();
    const a = fakeSocket();
    hub.connect("u1", a);
    const other = hub.connect("u2", fakeSocket());
    const call = hub.call("u1", "run-1", "fs.exists", { path: "x" }, 1500);
    const callId = (a.sent[1] as { callId: string }).callId;
    hub.receive(other, JSON.stringify({ type: "tool.result", callId, ok: true, value: { exists: true } }));
    expect(await call).toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  it("stops a run: cancels its calls in flight, refuses new ones, leaves other runs alone", async () => {
    const hub = new BridgeHub();
    const socket = fakeSocket();
    const connection = hub.connect("u1", socket);
    const stopped = hub.call("u1", "run-1", "sandbox.exec", { command: "npm", args: ["test"] }, 5000);
    const other = hub.call("u1", "run-2", "fs.stat", { path: "." }, 5000);
    const [first, second] = socket.sent.slice(1) as { callId: string }[];

    expect(hub.stopRun("run-1")).toBe(1);
    expect(socket.sent.at(-1)).toEqual({ type: "run.cancel", callId: first!.callId });
    expect(await stopped).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(await hub.call("u1", "run-1", "fs.readFile", { path: "a" })).toMatchObject({ ok: false, error: { code: "cancelled" } });

    hub.receive(connection, JSON.stringify({ type: "tool.result", callId: second!.callId, ok: true, value: { name: "." } }));
    expect(await other).toMatchObject({ ok: true });
  });
});

describe("callSummary", () => {
  it("summarises paths and commands for the audit log", async () => {
    const { callSummary } = await import("./bridge.service.js");
    expect(callSummary({ op: "fs.writeFile", args: { path: "src/a.ts" } })).toEqual({ op: "fs.writeFile", path: "src/a.ts", command: null });
    expect(callSummary({ op: "sandbox.exec", args: { command: "npm", args: ["test", "--", "-u"] } })).toEqual({ op: "sandbox.exec", path: null, command: "npm test -- -u" });
  });
});

describe("TicketStore", () => {
  it("redeems a ticket once, and never after it expires", () => {
    const store = new TicketStore();
    const { ticket } = store.issue("u1", 1000);
    expect(store.redeem(ticket, 2000)).toBe("u1");
    expect(store.redeem(ticket, 2000)).toBeNull();
    const late = store.issue("u1", 1000).ticket;
    expect(store.redeem(late, 1000 + 61_000)).toBeNull();
    expect(store.redeem(undefined)).toBeNull();
  });
});

describe("bridge WebSocket", () => {
  let server: Server | null = null;
  afterEach(async () => {
    await new Promise((r) => (server ? server.close(r) : r(null)));
    server = null;
  });

  async function start() {
    const hub = new BridgeHub();
    const tickets = new TicketStore();
    server = createServer();
    attachBridge(server, hub, tickets);
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    return { hub, tickets, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/bridge` };
  }

  it("connects with a valid ticket and completes a tool call end to end", async () => {
    const { hub, tickets, url } = await start();
    const ws = new WebSocket(`${url}?ticket=${tickets.issue("u1").ticket}`);
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "welcome") ws.send(JSON.stringify({ type: "hello", protocol: 1, client: "test", workspace: "shop" }));
      if (m.type === "tool.request") ws.send(JSON.stringify({ type: "tool.result", callId: m.callId, ok: true, value: { exists: true } }));
    });
    await new Promise((r) => ws.once("open", r));
    await vi.waitFor(() => expect(hub.status("u1")).toMatchObject({ connected: true, workspace: "shop" }));
    expect(await hub.call("u1", "run-1", "fs.exists", { path: "README.md" })).toMatchObject({ ok: true, value: { exists: true } });
    ws.close();
  });

  it("refuses a connection without a valid ticket", async () => {
    const { url } = await start();
    const ws = new WebSocket(`${url}?ticket=nope`);
    const status = await new Promise((resolve) => ws.once("unexpected-response", (_req, res) => resolve(res.statusCode)));
    expect(status).toBe(401);
  });
});
