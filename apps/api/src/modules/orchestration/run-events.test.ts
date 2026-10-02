import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabase.js", () => ({ supabaseAdmin: {} }));
vi.mock("../../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }, errorMessage: (e: unknown) => String(e) }));

const { RunEventWriter, followRun } = await import("./run-events.js");
type RunEvent = import("./run-events.js").RunEvent;
type RunEventStore = import("./run-events.js").RunEventStore;

function memoryStore() {
  const events: RunEvent[] = [];
  const store: RunEventStore = {
    async append(runId, event, data) {
      const id = events.length + 1;
      events.push({ id, runId, event, data });
      return id;
    },
    async listAfter(runId, afterId, limit) {
      return events.filter((e) => e.runId === runId && e.id > afterId).slice(0, limit);
    },
    async lastId(runId) {
      return events.filter((e) => e.runId === runId).at(-1)?.id ?? 0;
    },
    async lastIdOf(runId, event) {
      return events.filter((e) => e.runId === runId && e.event === event).at(-1)?.id ?? 0;
    },
  };
  return { events, store };
}

function target() {
  const received: { id: number; event: string; data: unknown }[] = [];
  return {
    received,
    closed: false,
    send(id: number, event: string, data: unknown) {
      received.push({ id, event, data });
    },
    comment() {},
    get isClosed() {
      return this.closed;
    },
  };
}

describe("RunEventWriter", () => {
  it("stores events in order and merges consecutive text deltas", async () => {
    const { events, store } = memoryStore();
    const bus = new EventEmitter();
    const writer = new RunEventWriter("run-1", store, bus);
    writer.send("run", { runId: "run-1" });
    writer.send("text", { delta: "Hel" });
    writer.send("text", { delta: "lo" });
    writer.send("tool", { phase: "call" });
    writer.send("text", { delta: "!" });
    writer.send("done", { status: "SUCCEEDED" });
    await writer.flush();
    expect(events.map((e) => [e.event, e.data])).toEqual([
      ["run", { runId: "run-1" }],
      ["text", { delta: "Hello" }],
      ["tool", { phase: "call" }],
      ["text", { delta: "!" }],
      ["done", { status: "SUCCEEDED" }],
    ]);
  });

  it("notifies the bus after each stored event", async () => {
    const { store } = memoryStore();
    const bus = new EventEmitter();
    const seen = vi.fn();
    bus.on("run-1", seen);
    const writer = new RunEventWriter("run-1", store, bus);
    writer.send("run", {});
    writer.send("done", {});
    await writer.flush();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("followRun", () => {
  it("replays stored events after an id and stops at done", async () => {
    const { store } = memoryStore();
    for (const e of ["run", "text", "gate", "done"]) await store.append("run-1", e, {});
    const t = target();
    const last = await followRun({ runId: "run-1", afterId: 1, target: t, store, bus: new EventEmitter(), pollMs: 20 });
    expect(t.received.map((r) => r.event)).toEqual(["text", "gate", "done"]);
    expect(last).toBe(4);
  });

  it("delivers events written after it started, then ends at done", async () => {
    const { store } = memoryStore();
    const bus = new EventEmitter();
    const t = target();
    const following = followRun({ runId: "run-1", afterId: 0, target: t, store, bus, pollMs: 1000 });
    const writer = new RunEventWriter("run-1", store, bus);
    writer.send("run", {});
    writer.send("text", { delta: "hi" });
    writer.send("done", {});
    await writer.flush();
    await following;
    expect(t.received.map((r) => r.event)).toEqual(["run", "text", "done"]);
  });

  it("ignores other runs and stops when the client goes away", async () => {
    const { store } = memoryStore();
    await store.append("run-2", "done", {});
    const t = target();
    const following = followRun({ runId: "run-1", afterId: 0, target: t, store, bus: new EventEmitter(), pollMs: 10 });
    t.closed = true;
    await following;
    expect(t.received).toEqual([]);
  });
});
