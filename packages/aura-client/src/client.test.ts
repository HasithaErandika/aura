import { describe, expect, it, vi } from "vitest";
import { createAuraClient } from "./client.js";

// A stream that ends after these frames (without "done", the server or a proxy dropped it).
function sse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(new TextEncoder().encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("turn streams", () => {
  it("resume from the last event id when the stream drops before done", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(sse(['id: 1\nevent: run\ndata: {"runId":"r1","runtimeRunId":null,"status":"PENDING"}\n\n', 'id: 2\nevent: text\ndata: {"delta":"Hel"}\n\n']))
        .mockResolvedValueOnce(sse(['id: 3\nevent: text\ndata: {"delta":"lo"}\n\n', 'id: 4\nevent: done\ndata: {"runId":"r1","status":"SUCCEEDED","approvalId":null}\n\n']));
      const client = createAuraClient({ baseUrl: "http://api.test", token: "t", fetch: fetchMock as unknown as typeof fetch });
      const events: string[] = [];
      const run = (async () => {
        for await (const e of client.threads.send("th1", "hi", { agentId: "vscode-agent" })) events.push(e.event === "text" ? `text:${e.data.delta}` : e.event);
      })();
      await vi.runAllTimersAsync();
      await run;
      expect(events).toEqual(["run", "text:Hel", "text:lo", "done"]);
      expect(fetchMock.mock.calls[1]?.[0]).toBe("http://api.test/runs/r1/events?after=2");
    } finally {
      vi.useRealTimers();
    }
  });
});
