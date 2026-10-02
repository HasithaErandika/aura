import { describe, expect, it } from "vitest";
import { sseFrame } from "./sse.js";

describe("sseFrame", () => {
  it("writes an event with JSON data", () => {
    expect(sseFrame("text", { delta: "hi" })).toBe('event: text\ndata: {"delta":"hi"}\n\n');
  });

  it("writes the id first when given", () => {
    expect(sseFrame("done", null, 7)).toBe("id: 7\nevent: done\ndata: null\n\n");
  });

  it("keeps multi-line text on one data line", () => {
    expect(sseFrame("text", "a\nb")).toBe('event: text\ndata: "a\\nb"\n\n');
  });
});
