import { describe, expect, it } from "vitest";
import { modelFromFinish, preview, runtimeErrorMessage } from "./run-stream.service.js";

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

describe("modelFromFinish", () => {
  it("names the answering model as provider/model for the audit trail", () => {
    expect(modelFromFinish({ response: { modelId: "openai/gpt-oss-120b", modelMetadata: { modelProvider: "groq.chat" } } })).toBe("groq/openai/gpt-oss-120b");
    expect(modelFromFinish({ response: { modelId: "groq/openai/gpt-oss-120b", modelMetadata: { modelProvider: "groq.chat" } } })).toBe("groq/openai/gpt-oss-120b");
    expect(modelFromFinish({ response: { modelId: "gemini-3.5-flash-lite", modelMetadata: { modelProvider: "google.generative-ai" } } })).toBe("google/gemini-3.5-flash-lite");
    expect(modelFromFinish({ response: { modelId: "x" } })).toBe("x");
    expect(modelFromFinish({})).toBeNull();
    expect(modelFromFinish(undefined)).toBeNull();
  });
});
