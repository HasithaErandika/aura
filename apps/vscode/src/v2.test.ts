import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolRequestMessage } from "@aura/bridge";
import { executeRequest } from "./bridge-client.js";
import { WorkspaceExecutor } from "./executor.js";
import { afterEditCommands, isCommit, runBeforeCommit } from "./hooks.js";
import { PermissionPolicy, globToRegExp, parseRule, ruleFor } from "./permissions.js";
import { EMPTY_SETTINGS, allowedModes, mergeSettings, parseSettings, withAllowRule } from "./project-settings.js";

let root: string;
let exec: WorkspaceExecutor;

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "aura-v2-"));
  mkdirSync(path.join(root, "src", "deep"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "lib"), { recursive: true });
  writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n// TODO: tidy\nconst b = a;\n");
  writeFileSync(path.join(root, "src", "deep", "b.ts"), "// todo later\n");
  writeFileSync(path.join(root, "node_modules", "lib", "x.js"), "// TODO hidden in deps\n");
  writeFileSync(path.join(root, ".env"), "TODO=secret\n");
  exec = new WorkspaceExecutor(root);
});

afterAll(() => {
  exec.killAll();
  rmSync(root, { recursive: true, force: true });
});

describe("permission modes and project rules", () => {
  const write = { path: "src/a.ts", content: "x" };

  it("plan mode allows reads and checks, refuses every change and other commands", () => {
    const p = new PermissionPolicy();
    p.mode = "plan";
    expect(p.decide("fs.readFile", { path: "src/a.ts" }).kind).toBe("allow");
    expect(p.decide("sandbox.exec", { command: "npm test" }).kind).toBe("allow");
    expect(p.decide("fs.writeFile", write).kind).toBe("deny");
    expect(p.decide("sandbox.exec", { command: "npm install" }).kind).toBe("deny");
    expect(p.decide("proc.spawn", { command: "npm run dev" }).kind).toBe("deny");
  });

  it("accept-edits mode allows file changes but still asks for commands", () => {
    const p = new PermissionPolicy();
    p.mode = "acceptEdits";
    expect(p.decide("fs.writeFile", write).kind).toBe("allow");
    expect(p.decide("sandbox.exec", { command: "npm install" }).kind).toBe("ask");
    expect(p.decide("sandbox.exec", { command: "sudo ls" }).kind).toBe("deny");
  });

  it("applies deny, then ask, then allow rules; built-in denies always win", () => {
    const p = new PermissionPolicy();
    p.mode = "acceptEdits";
    expect(p.setRules({ allow: ["Bash(npm run e2e:*)", "Bash(sudo ls)", "Edit(docs/**)"], ask: ["Edit(package.json)", "Bash(npm test)"], deny: ["Read(.env*)", "Edit(src/generated/**)", "nonsense"] })).toEqual(["nonsense"]);
    expect(p.decide("sandbox.exec", { command: "npm run e2e" }).kind).toBe("allow");
    expect(p.decide("sandbox.exec", { command: "npm run e2e -- --headed" }).kind).toBe("allow");
    expect(p.decide("sandbox.exec", { command: "npm run e2e; rm -rf src" }).kind).toBe("ask");
    expect(p.decide("sandbox.exec", { command: "sudo ls" }).kind).toBe("deny");
    expect(p.decide("sandbox.exec", { command: "npm test" }).kind).toBe("ask");
    expect(p.decide("fs.writeFile", { path: "package.json", content: "{}" }).kind).toBe("ask");
    expect(p.decide("fs.writeFile", { path: "src/generated/api.ts", content: "" }).kind).toBe("deny");
    expect(p.decide("fs.readFile", { path: ".env.local" }).kind).toBe("deny");
    expect(p.decide("fs.readFile", { path: "src/a.ts" }).kind).toBe("allow");
    p.mode = "default";
    expect(p.decide("fs.writeFile", { path: "docs/x.md", content: "" }).kind).toBe("allow");
    expect(p.decide("fs.writeFile", write).kind).toBe("ask");
  });

  it("turns an approval into the narrowest rule", () => {
    expect(ruleFor("sandbox.exec", { command: "npm", args: ["run", "e2e"] })).toBe("Bash(npm run e2e)");
    expect(ruleFor("fs.writeFile", { path: "./src/a.ts", content: "" })).toBe("Edit(src/a.ts)");
    expect(parseRule("Bash(git commit:*)")).toEqual({ tool: "Bash", command: "git commit", prefix: true });
    expect(globToRegExp("src/**/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/x/y/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/x/a.ts")).toBe(false);
  });
});

describe("project settings", () => {
  it("reads rules, hooks and the default mode, and reports problems", () => {
    const s = parseSettings(JSON.stringify({ defaultMode: "acceptEdits", permissions: { allow: ["Bash(npm run e2e)"], deny: "Read(.env)" }, hooks: { afterEdit: ["npx prettier --write {file}"] } }), ".aura/settings.json");
    expect(s.defaultMode).toBe("acceptEdits");
    expect(s.permissions.allow).toEqual(["Bash(npm run e2e)"]);
    expect(s.hooks.afterEdit).toHaveLength(1);
    expect(s.problems).toEqual([".aura/settings.json permissions.deny must be a list of strings"]);
    expect(parseSettings("{oops", "f").problems[0]).toMatch(/not valid JSON/);
    expect(parseSettings(null, "f")).toMatchObject({ defaultMode: null, problems: [] });
  });

  it("combines shared and local settings, the local mode winning", () => {
    const shared = parseSettings(JSON.stringify({ defaultMode: "plan", permissions: { allow: ["Bash(a)"] } }), "s");
    const local = parseSettings(JSON.stringify({ defaultMode: "default", permissions: { allow: ["Bash(b)"] } }), "l");
    expect(mergeSettings(shared, local)).toMatchObject({ defaultMode: "default", permissions: { allow: ["Bash(a)", "Bash(b)"] } });
    expect(mergeSettings(EMPTY_SETTINGS, EMPTY_SETTINGS).defaultMode).toBeNull();
  });

  it("adds an allow rule to the local file once, keeping what is there", () => {
    const once = withAllowRule(JSON.stringify({ defaultMode: "plan", permissions: { deny: ["Read(.env)"] } }), "Bash(npm run e2e)");
    expect(JSON.parse(once)).toEqual({ defaultMode: "plan", permissions: { deny: ["Read(.env)"], allow: ["Bash(npm run e2e)"] } });
    expect(withAllowRule(once, "Bash(npm run e2e)")).toBe(once);
    expect(JSON.parse(withAllowRule(null, "Edit(a.ts)"))).toEqual({ permissions: { allow: ["Edit(a.ts)"] } });
  });

  it("maps the admin's setting to the modes a developer may pick", () => {
    expect(allowedModes("plan-only")).toEqual(["plan"]);
    expect(allowedModes("no-accept-edits")).toEqual(["plan", "default"]);
    expect(allowedModes(undefined)).toEqual(["plan", "default", "acceptEdits"]);
  });
});

describe("hooks", () => {
  const hooks = { afterEdit: ["npx prettier --write {file}"], beforeCommit: ["npm run lint", "npm test"] };

  it("fills {file} for changes only, and spots commits", () => {
    expect(afterEditCommands(hooks, "fs.writeFile", { path: "src/my file.ts" })).toEqual(["npx prettier --write 'src/my file.ts'"]);
    expect(afterEditCommands(hooks, "fs.readFile", { path: "a" })).toEqual([]);
    expect(isCommit("sandbox.exec", { command: "git commit -m x" })).toBe(true);
    expect(isCommit("sandbox.exec", { command: "git commit-tree" })).toBe(false);
  });

  it("stops at the first failing beforeCommit hook", async () => {
    const run = vi.fn(async (c: string) => ({ exitCode: c === "npm run lint" ? 1 : 0, output: "2 errors" }));
    const result = await runBeforeCommit(hooks, run);
    expect(result).toMatchObject({ ok: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await runBeforeCommit({ afterEdit: [], beforeCommit: [] }, run)).toEqual({ ok: true });
  });

  it("refuses a commit when a hook fails, and runs afterEdit after a write", async () => {
    const request = (op: ToolRequestMessage["op"], args: Record<string, unknown>): ToolRequestMessage => ({ type: "tool.request", callId: "c1", runId: "r1", op, args: args as never, timeoutMs: 5000 });
    const policy = new PermissionPolicy();
    policy.mode = "acceptEdits";
    const log = vi.fn();
    const gate = await executeRequest(request("sandbox.exec", { command: "git commit -m x" }), { executor: exec, policy, ask: async () => "once", log, hooks: () => ({ afterEdit: [], beforeCommit: ["node -e 'process.exit(2)'"] }) });
    expect(gate).toMatchObject({ ok: false, error: { code: "failed" } });
    expect((gate as { error: { message: string } }).error.message).toMatch(/beforeCommit hook .* failed \(exit 2\)/);

    const written = await executeRequest(request("fs.writeFile", { path: "src/new.ts", content: "x" }), { executor: exec, policy, ask: vi.fn(), log, hooks: () => ({ afterEdit: ["node -e \"require('fs').appendFileSync('{file}', '!')\""], beforeCommit: [] }) });
    expect(written).toMatchObject({ ok: true });
    expect(await exec.run("fs.readFile", { path: "src/new.ts" })).toMatchObject({ content: "x!" });
  });

  it("saves 'Allow for this project' as a rule", async () => {
    const allowForProject = vi.fn(async () => undefined);
    const request: ToolRequestMessage = { type: "tool.request", callId: "c2", runId: "r1", op: "sandbox.exec", args: { command: "node --help" } as never, timeoutMs: 5000 };
    await executeRequest(request, { executor: exec, policy: new PermissionPolicy(), ask: async () => "project", log: () => {}, allowForProject });
    expect(allowForProject).toHaveBeenCalledWith("Bash(node --help)");
  });
});

describe("grep and background processes", () => {
  it("searches text files, skipping dependencies and hidden files", async () => {
    const r = await exec.run("fs.grep", { pattern: "todo", path: ".", caseSensitive: false });
    expect(r.files.map((f) => f.path).sort()).toEqual(["src/a.ts", "src/deep/b.ts"]);
    expect(r.files.find((f) => f.path === "src/a.ts")?.matches[0]).toMatchObject({ line: 2, column: 3 });
    const withContext = await exec.run("fs.grep", { pattern: "TODO", path: "src/a.ts", contextLines: 1 });
    expect(withContext.files[0]?.matches[0]).toMatchObject({ before: ["export const a = 1;"], after: ["const b = a;"] });
    await expect(exec.run("fs.grep", { pattern: "(", path: "." })).rejects.toMatchObject({ code: "invalid" });
  });

  it("starts, reads only new output from, lists and stops a background process", async () => {
    const started = await exec.run("proc.spawn", { command: "node -e \"console.log('ready'); setInterval(() => console.log('tick'), 50)\"" });
    expect(started.running).toBe(true);
    await vi.waitFor(async () => expect((await exec.run("proc.read", { pid: started.pid })).stdout).toContain("ready"), { timeout: 5000 });
    const first = await exec.run("proc.read", { pid: started.pid });
    await new Promise((r) => setTimeout(r, 150));
    const next = await exec.run("proc.read", { pid: started.pid, stdoutOffset: first.stdoutOffset });
    expect(next.stdout).not.toContain("ready");
    expect(next.stdout).toContain("tick");
    expect((await exec.run("proc.list", {} as never)).processes.map((p) => p.pid)).toContain(started.pid);
    expect(await exec.run("proc.kill", { pid: started.pid })).toEqual({ killed: true });
    await vi.waitFor(async () => expect((await exec.run("proc.read", { pid: started.pid })).running).toBe(false), { timeout: 5000 });
    await expect(exec.run("proc.read", { pid: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });
});
