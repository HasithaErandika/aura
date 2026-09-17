import type { Request, Response } from "express";

// Minimal server-sent-events writer for Express. The browser consumes it with fetch + a
// ReadableStream reader (EventSource cannot send a bearer token or a POST body).
export class SseWriter {
  private closed = false;

  constructor(
    private readonly req: Request,
    private readonly res: Response,
  ) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    req.on("close", () => {
      this.closed = true;
    });
  }

  get isClosed() {
    return this.closed;
  }

  send(event: string, data: unknown) {
    if (this.closed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  comment(text: string) {
    if (this.closed) return;
    this.res.write(`: ${text}\n\n`);
  }

  end() {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}
