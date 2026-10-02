import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "./index.js";

describe("parseServerMessage", () => {
  it("accepts a valid tool request and rejects unknown ops or bad JSON", () => {
    const ok = { type: "tool.request", callId: "c1", runId: "r1", op: "fs.readFile", args: { path: "package.json" }, timeoutMs: 1000 };
    expect(parseServerMessage(JSON.stringify(ok))).toEqual(ok);
    expect(parseServerMessage(JSON.stringify({ ...ok, op: "shell.anything" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...ok, args: "rm -rf /" }))).toBeNull();
    expect(parseServerMessage("not json")).toBeNull();
    for (const op of ["fs.grep", "proc.spawn", "proc.read", "proc.kill", "proc.list"]) expect(parseServerMessage(JSON.stringify({ ...ok, op }))?.type, op).toBe("tool.request");
  });
});

describe("parseClientMessage", () => {
  it("accepts results and maps unknown error codes to failed", () => {
    expect(parseClientMessage(JSON.stringify({ type: "tool.result", callId: "c1", ok: true, value: { exists: true } }))).toEqual({ type: "tool.result", callId: "c1", ok: true, value: { exists: true } });
    expect(parseClientMessage(JSON.stringify({ type: "tool.result", callId: "c1", ok: false, error: { code: "weird", message: "x" } }))).toEqual({
      type: "tool.result",
      callId: "c1",
      ok: false,
      error: { code: "failed", message: "x" },
    });
    expect(parseClientMessage(JSON.stringify({ type: "tool.result", callId: "c1", ok: false }))).toBeNull();
  });

  it("accepts hello", () => {
    expect(parseClientMessage(JSON.stringify({ type: "hello", protocol: 1, client: "vscode", workspace: "shop" }))).toEqual({ type: "hello", protocol: 1, client: "vscode", workspace: "shop" });
  });
});
