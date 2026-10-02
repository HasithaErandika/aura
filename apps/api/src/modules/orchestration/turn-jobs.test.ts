import { describe, expect, it, vi, beforeEach } from "vitest";

const stored: { runId: string; event: string; data: unknown }[] = [];
const runs = new Map<string, { id: string; status: string; updated_at: string }>();

vi.mock("../../config/env.js", () => ({ env: { databaseUrl: undefined, turnConcurrency: 4, turnConcurrencyPerUser: 2 } }));
vi.mock("../../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }, errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }));
vi.mock("../approvals/approvals.service.js", () => ({ expireOverdue: vi.fn() }));
vi.mock("./run-stream.service.js", () => ({
  startTurn: vi.fn(async () => {
    throw new Error("runtime unreachable");
  }),
  resumeTurn: vi.fn(),
}));
vi.mock("./run-events.js", () => ({
  RunEventWriter: class {
    constructor(private runId: string) {}
    send(event: string, data: unknown) {
      stored.push({ runId: this.runId, event, data });
    }
    async flush() {}
  },
}));
vi.mock("../runs/runs.repository.js", () => ({
  runsRepository: {
    findById: async (id: string) => runs.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => Object.assign(runs.get(id)!, patch),
    touch: async () => undefined,
    listStale: async (before: string) => [...runs.values()].filter((r) => r.status === "RUNNING" && r.updated_at < before),
  },
}));

const { interruptStaleRuns, runTurnJob, stopTurn, STALE_AFTER_MS } = await import("./turn-jobs.js");
const { startTurn } = await import("./run-stream.service.js");

const user = { id: "u1", email: "u@example.com", fullName: null, role: "developer" as const, via: "session" as const };

beforeEach(() => {
  stored.length = 0;
  runs.clear();
});

describe("runTurnJob", () => {
  it("fails the run and still ends the stream with done when the turn throws", async () => {
    runs.set("run-1", { id: "run-1", status: "PENDING", updated_at: new Date().toISOString() });
    await runTurnJob({ kind: "start", runId: "run-1", message: "hi", requestId: "req-1", user });
    expect(runs.get("run-1")?.status).toBe("FAILED");
    expect(stored.map((e) => e.event)).toEqual(["error", "done"]);
    expect(stored[0]?.data).toEqual({ message: "runtime unreachable" });
  });

  it("passes Stop to the running turn, and only while it runs", async () => {
    runs.set("run-2", { id: "run-2", status: "PENDING", updated_at: new Date().toISOString() });
    let seen: AbortSignal | undefined;
    vi.mocked(startTurn).mockImplementationOnce(async (input) => {
      seen = input.stop;
      await new Promise((resolve) => input.stop!.addEventListener("abort", resolve));
      return { status: "INTERRUPTED", approvalId: null };
    });
    const job = runTurnJob({ kind: "start", runId: "run-2", message: "hi", requestId: "req-1", user });
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(stopTurn("run-2")).toBe(true);
    await job;
    expect(seen!.aborted).toBe(true);
    expect(stopTurn("run-2")).toBe(false);
  });

  it("skips a turn stopped while it was queued", async () => {
    runs.set("run-3", { id: "run-3", status: "INTERRUPTED", updated_at: new Date().toISOString() });
    vi.mocked(startTurn).mockClear();
    await runTurnJob({ kind: "start", runId: "run-3", message: "hi", requestId: "req-1", user });
    expect(startTurn).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it("ends the stream when the run doesn't exist", async () => {
    await runTurnJob({ kind: "start", runId: "missing", message: "hi", requestId: "req-1", user });
    expect(stored.at(-1)).toMatchObject({ event: "done", data: { status: "FAILED" } });
  });
});

describe("interruptStaleRuns", () => {
  it("interrupts RUNNING runs without a recent heartbeat, leaving others alone", async () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    runs.set("stale", { id: "stale", status: "RUNNING", updated_at: new Date(now - STALE_AFTER_MS - 1000).toISOString() });
    runs.set("fresh", { id: "fresh", status: "RUNNING", updated_at: new Date(now - 10_000).toISOString() });
    runs.set("waiting", { id: "waiting", status: "SUSPENDED_FOR_APPROVAL", updated_at: new Date(now - 86_400_000).toISOString() });
    expect(await interruptStaleRuns(now)).toBe(1);
    expect(runs.get("stale")?.status).toBe("INTERRUPTED");
    expect(runs.get("fresh")?.status).toBe("RUNNING");
    expect(runs.get("waiting")?.status).toBe("SUSPENDED_FOR_APPROVAL");
    expect(stored.filter((e) => e.runId === "stale").map((e) => e.event)).toEqual(["error", "done"]);
  });
});
