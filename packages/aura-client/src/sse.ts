// Reads the server-sent-events framing apps/api's SseWriter emits ("event: x\ndata: {json}\n\n")
// from a fetch Response body. EventSource is not used anywhere: it cannot send a bearer token or
// a POST body.

export interface SseMessage {
  event: string;
  data: unknown;
  // The run event id (apps/api run_events), for resuming with GET /runs/:id/events?after=<id>.
  id?: number;
}

function parseFrame(frame: string): SseMessage | null {
  let event = "message";
  let id: number | undefined;
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith("id:")) id = Number(line.slice(3).trim()) || undefined;
  }
  // Comment-only frames (": keepalive") carry no data.
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw), ...(id ? { id } : {}) };
  } catch {
    return { event, data: raw, ...(id ? { id } : {}) };
  }
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const message = parseFrame(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        if (message) yield message;
        separator = buffer.indexOf("\n\n");
      }
    }
    const tail = parseFrame(buffer.trim());
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
