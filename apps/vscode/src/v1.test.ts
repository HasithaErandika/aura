import { describe, expect, it } from "vitest";
import { addUserMessage, applyEvent, emptyChat, fromHistory, markStopping, toolDetail } from "./chat/model.js";
import { ciWorkflow, defaultSettings, parseGitRemote, remoteMatches, withAuraIgnores } from "./project-setup.js";

describe("chat model", () => {
  it("streams text into one assistant message and tracks tool calls by id", () => {
    let s = addUserMessage(emptyChat("KAN-45"), "run the tests");
    s = applyEvent(s, { event: "run", data: { runId: "r1", runtimeRunId: null, status: "PENDING" } });
    s = applyEvent(s, { event: "text", data: { delta: "Running " } });
    s = applyEvent(s, { event: "text", data: { delta: "tests." } });
    s = applyEvent(s, { event: "tool", data: { phase: "call", toolName: "mastra_workspace_execute_command", toolCallId: "t1", args: { command: "npm test" } } });
    expect(s.items.at(-1)).toMatchObject({ kind: "tool", name: "execute command", detail: "npm test", state: "running" });
    s = applyEvent(s, { event: "tool", data: { phase: "result", toolName: "mastra_workspace_execute_command", toolCallId: "t1", result: "3 passed" } });
    s = applyEvent(s, { event: "done", data: { runId: "r1", status: "SUCCEEDED", approvalId: null } });
    expect(s.busy).toBe(false);
    expect(s.runId).toBe("r1");
    expect(s.items.map((i) => i.kind)).toEqual(["user", "assistant", "tool"]);
    expect(s.items[1]).toMatchObject({ text: "Running tests." });
    expect(s.items[2]).toMatchObject({ state: "done", result: "3 passed" });
  });

  it("closes unfinished tool calls and explains an interrupted turn", () => {
    let s = applyEvent(emptyChat(), { event: "tool", data: { phase: "call", toolName: "mastra_workspace_write_file", toolCallId: "t1", args: { path: "a.ts" } } });
    s = applyEvent(s, { event: "done", data: { runId: "r1", status: "INTERRUPTED", approvalId: null } });
    expect(s.items[0]).toMatchObject({ state: "error" });
    expect(s.items.at(-1)).toMatchObject({ kind: "notice", tone: "error" });
  });

  it("marks a Stop until the turn ends, and explains it once", () => {
    let s = applyEvent(addUserMessage(emptyChat(), "go"), { event: "run", data: { runId: "r1", runtimeRunId: null, status: "PENDING" } });
    s = markStopping(s);
    expect(s).toMatchObject({ busy: true, stopping: true });
    s = applyEvent(s, { event: "error", data: { message: "Stopped. Send a message to continue." } });
    s = applyEvent(s, { event: "done", data: { runId: "r1", status: "INTERRUPTED", approvalId: null } });
    expect(s).toMatchObject({ busy: false, stopping: false, runId: "r1" });
    expect(s.items.filter((i) => i.kind === "notice").map((i) => (i as { text: string }).text)).toEqual(["Stopped. Send a message to continue."]);
    expect(markStopping(s)).toBe(s);
  });

  it("rebuilds a conversation from history", () => {
    const s = fromHistory([
      { id: "m1", role: "user", text: "hi", tools: [], createdAt: null },
      { id: "m2", role: "assistant", text: "Done.", tools: [{ toolCallId: "t", toolName: "mastra_workspace_read_file", state: "result", args: { path: "package.json" }, result: "{}" }], createdAt: null },
    ], "KAN-45", "r9");
    expect(s.items.map((i) => i.kind)).toEqual(["user", "tool", "assistant"]);
    expect(s.runId).toBe("r9");
  });

  it("describes a tool call by its file or command", () => {
    expect(toolDetail({ command: "npm", args: ["run", "lint"] })).toBe("npm run lint");
    expect(toolDetail({ path: "src/a.ts" })).toBe("src/a.ts");
  });
});

describe("project setup", () => {
  it("parses SSH and HTTPS remotes", () => {
    expect(parseGitRemote("git@github.com:acme/shop.git")).toEqual({ host: "github.com", owner: "acme", name: "shop" });
    expect(parseGitRemote("https://github.com/acme/shop")).toEqual({ host: "github.com", owner: "acme", name: "shop" });
    expect(parseGitRemote("https://token@github.com/acme/shop.git")).toEqual({ host: "github.com", owner: "acme", name: "shop" });
    expect(parseGitRemote("not a url")).toBeNull();
  });

  it("compares a remote with the registered repository", () => {
    expect(remoteMatches({ owner: "Acme", name: "Shop" }, { owner: "acme", name: "shop" })).toBe(true);
    expect(remoteMatches({ owner: "acme", name: "other" }, { owner: "acme", name: "shop" })).toBe(false);
    expect(remoteMatches(null, { owner: "acme", name: "shop" })).toBeNull();
  });

  it("adds AURA's ignores once", () => {
    const once = withAuraIgnores("node_modules/\n");
    expect(once).toContain(".aura/worktrees/");
    expect(withAuraIgnores(once)).toBe(once);
    expect(withAuraIgnores("")).toContain(".aura/settings.local.json");
  });

  it("starts a project with settings the parser accepts", async () => {
    const { parseSettings } = await import("./project-settings.js");
    const s = parseSettings(defaultSettings(["frontend", "backend"]), ".aura/settings.json");
    expect(s.problems).toEqual([]);
    expect(s.hooks.beforeCommit).toEqual(["cd frontend && npm run lint --if-present", "cd backend && npm run lint --if-present"]);
    expect(s.permissions.deny).toContain("Read(**/.env)");
  });

  it("writes one CI job per app folder", () => {
    const yaml = ciWorkflow(["frontend", "backend"]);
    expect(yaml).toContain("  frontend:");
    expect(yaml).toContain("  backend:");
    expect(yaml).toContain("working-directory: backend");
    expect(yaml).toContain("branches: [development, main]");
  });
});
