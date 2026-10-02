import type { Request, Response } from "express";

export function sseFrame(event: string, data: unknown, id?: number): string {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class SseWriter {
  private closed = false;

  constructor(
    req: Request,
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

  send(event: string, data: unknown, id?: number) {
    if (!this.closed) this.res.write(sseFrame(event, data, id));
  }

  comment(text: string) {
    if (!this.closed) this.res.write(`: ${text}\n\n`);
  }

  end() {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}
