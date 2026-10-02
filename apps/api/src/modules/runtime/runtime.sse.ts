import type { RuntimeChunk } from "./runtime.types.js";

export function frameData(frame: string): string {
  return frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

// Non-JSON frames are runtime keep-alives and are skipped.
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<RuntimeChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
        const data = frameData(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (!data) continue;
        try {
          yield JSON.parse(data) as RuntimeChunk;
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
