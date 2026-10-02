import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: { runId: string; event: string; data: unknown }[] = [];
const updates: Record<string, unknown>[] = [];
const audits: Record<string, unknown>[] = [];
let localTurn = false;

vi.mock("../audit/index.js", () => ({ writeAudit: vi.fn(async (e: Record<string, unknown>) => void audits.push(e)) }));
vi.mock("../bridge/index.js", () => ({ cancelBridgeCalls: vi.fn(() => 1) }));
vi.mock("./run-stream.service.js", () => ({ STOPPED_MESSAGE: "Stopped. Send a message to continue." }));
vi.mock("./turn-jobs.js", () => ({ stopTurn: vi.fn(() => localTurn) }));
vi.mock("../runs/index.js", () => ({ runsRepository: { update: vi.fn(async (_id: string, patch: Record<string, unknown>) => void updates.push(patch)) } }));
vi.mock("./run-events.js", () => ({
  RunEventWriter: class {
    constructor(private runId: string) {}
    send(event: string, data: unknown) {
      stored.push({ runId: this.runId, event, data });
    }
    async flush() {}
  },
}));

const { stopRun } = await import("./stop-run.js");
const { cancelBridgeCalls } = await import("../bridge/index.js");

const user = { id: "u1", role: "developer" as const };
const run = (status: string) => ({ id: "run-1", status, requested_by: "u1" }) as never;

beforeEach(() => {
  stored.length = 0;
  updates.length = 0;
  audits.length = 0;
  localTurn = false;
});

describe("stopRun", () => {
  it("aborts a turn running here and cancels its tool calls; the turn records the end itself", async () => {
    localTurn = true;
    expect(await stopRun(run("RUNNING"), user, "req-1")).toBe("stopped");
    expect(cancelBridgeCalls).toHaveBeenCalledWith("run-1");
    expect(updates).toEqual([]);
    expect(audits[0]).toMatchObject({ action: "run.stopped", entityId: "run-1", metadata: { result: "stopped", cancelledCalls: 1 } });
  });

  it("ends a queued turn as INTERRUPTED and closes its event stream", async () => {
    expect(await stopRun(run("PENDING"), user, "req-1")).toBe("dequeued");
    expect(updates[0]).toMatchObject({ status: "INTERRUPTED" });
    expect(stored.map((e) => e.event)).toEqual(["error", "done"]);
    expect(stored[1]?.data).toMatchObject({ status: "INTERRUPTED" });
  });

  it("refuses a run that isn't running, or runs in another process", async () => {
    await expect(stopRun(run("SUCCEEDED"), user, "req-1")).rejects.toMatchObject({ status: 409 });
    await expect(stopRun(run("RUNNING"), user, "req-1")).rejects.toMatchObject({ status: 409 });
    expect(audits).toEqual([]);
  });
});
