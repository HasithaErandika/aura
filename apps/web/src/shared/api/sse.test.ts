import { describe, expect, it } from "vitest";
import { parseSseFrame, splitSseBuffer } from "./sse.ts";

describe("server-sent events", () => {
  it("parses event, id and JSON data", () => {
    expect(parseSseFrame('event: text\nid: 7\ndata: {"delta":"hi"}')).toEqual({ event: "text", data: { delta: "hi" }, id: 7 });
    expect(parseSseFrame("data: plain")).toEqual({ event: "message", data: "plain", id: null });
    expect(parseSseFrame(": keep-alive")).toBeNull();
  });

  it("keeps a partial frame for the next chunk", () => {
    expect(splitSseBuffer("data: 1\n\ndata: 2\n\ndata: 3")).toEqual({ frames: ["data: 1", "data: 2"], rest: "data: 3" });
    expect(splitSseBuffer("data: 1\r\n\r\n")).toEqual({ frames: ["data: 1"], rest: "" });
  });
});
