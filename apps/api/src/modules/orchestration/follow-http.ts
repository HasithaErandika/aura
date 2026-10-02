import type { Request, Response } from "express";
import { SseWriter } from "../../lib/http/sse.js";
import { followRun } from "./run-events.js";

// Streams a run's stored events to an HTTP client as SSE (with event ids) until the turn ends or
// the client disconnects. Disconnecting never stops the turn itself (turn-jobs.ts).
export async function streamRunEvents(req: Request, res: Response, runId: string, afterId: number): Promise<void> {
  const writer = new SseWriter(req, res);
  await followRun({
    runId,
    afterId,
    target: {
      send: (id, event, data) => writer.sendWithId(id, event, data),
      comment: (text) => writer.comment(text),
      get isClosed() {
        return writer.isClosed;
      },
    },
  });
  writer.end();
}
