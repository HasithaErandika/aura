import { describe, expect, it } from "vitest";
import { preview, runtimeErrorMessage } from "./run-stream.service.js";

describe("preview", () => {
  it("truncates long strings", () => {
    expect(preview("abcdef", 3)).toBe("abc...");
    expect(preview("abc", 3)).toBe("abc");
  });

  it("keeps small objects and summarizes large ones", () => {
    expect(preview({ a: 1 }, 50)).toEqual({ a: 1 });
    expect(preview({ text: "x".repeat(100) }, 10)).toEqual({ truncated: true, preview: '{"text":"x' });
  });

  it("passes other values through", () => {
    expect(preview(42)).toBe(42);
    expect(preview(null)).toBeNull();
  });
});

describe("runtimeErrorMessage", () => {
  it("reads a nested or a flat message", () => {
    expect(runtimeErrorMessage({ error: { message: "model overloaded" } })).toBe("model overloaded");
    expect(runtimeErrorMessage({ message: "bad tool input" })).toBe("bad tool input");
  });

  it("falls back to a generic message", () => {
    expect(runtimeErrorMessage(undefined)).toBe("runtime error");
  });
});
