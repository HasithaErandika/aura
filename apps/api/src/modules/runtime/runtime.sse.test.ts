import { describe, expect, it } from "vitest";
import { frameData, parseSse } from "./runtime.sse.js";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("runtime SSE parsing", () => {
  it("joins multi-line data fields", () => {
    expect(frameData("event: x\ndata: {\"a\":\ndata: 1}")).toBe('{"a":\n1}');
  });

  it("yields JSON frames split across chunks and skips keep-alives", async () => {
    const chunks = [];
    for await (const chunk of parseSse(streamOf('data: {"type":"start"}\n\n: ping\n\ndata: {"ty', 'pe":"finish"}\r\n\r\ndata: [DONE]\n\n'))) chunks.push(chunk);
    expect(chunks).toEqual([{ type: "start" }, { type: "finish" }]);
  });
});
