import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({ env: { approvalSlaHours: 72, runTurnTimeoutMs: 600_000 } }));

const { SETTING_DEFINITIONS, settingDefinition } = await import("./settings.registry.js");
const { authorizeTarget, capFor, resolveSettings, runtimeSettings } = await import("./settings.resolve.js");
type StoredSetting = import("./settings.resolve.js").StoredSetting;
type AuthedUser = import("../../middleware/auth.js").AuthedUser;

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

const row = (scope: StoredSetting["scope"], scopeId: string | null, key: string, value: unknown): StoredSetting => ({ scope, scopeId, key, value });
const user = (role: AuthedUser["role"]): AuthedUser => ({ id: USER, email: "u@example.com", fullName: null, role, via: "session" }) as AuthedUser;

describe("settings registry", () => {
  it("has unique keys and defaults that pass their own schema", () => {
    const keys = SETTING_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of SETTING_DEFINITIONS) expect(def.schema.safeParse(def.fallback()).success, def.key).toBe(true);
  });

  it("uses .env values as the fallback for API-owned settings", () => {
    expect(settingDefinition("governance.approvalSlaHours")?.fallback()).toBe(72);
    expect(settingDefinition("limits.turnTimeoutMinutes")?.fallback()).toBe(10);
  });
});

describe("resolveSettings", () => {
  it("falls back to defaults when nothing is stored", () => {
    const eff = resolveSettings([], { projectId: PROJECT, userId: USER });
    expect(eff["council.maxRounds"]).toEqual({ value: 2, source: "default" });
  });

  it("prefers user over project over global", () => {
    const rows = [row("global", null, "council.mode", "full"), row("project", PROJECT, "council.mode", "lean"), row("user", USER, "council.mode", "auto")];
    expect(resolveSettings(rows, { projectId: PROJECT, userId: USER })["council.mode"]).toEqual({ value: "auto", source: "user" });
    expect(resolveSettings(rows, { projectId: PROJECT, userId: null })["council.mode"]).toEqual({ value: "lean", source: "project" });
    expect(resolveSettings(rows, { projectId: OTHER_PROJECT, userId: null })["council.mode"]).toEqual({ value: "full", source: "global" });
  });

  it("ignores another project's and another user's rows", () => {
    const rows = [row("project", OTHER_PROJECT, "council.maxRounds", 4), row("user", "someone-else", "council.mode", "lean")];
    const eff = resolveSettings(rows, { projectId: PROJECT, userId: USER });
    expect(eff["council.maxRounds"]?.source).toBe("default");
    expect(eff["council.mode"]?.source).toBe("default");
  });

  it("ignores stored values that are out of bounds", () => {
    const eff = resolveSettings([row("global", null, "council.maxRounds", 99)], { projectId: null, userId: null });
    expect(eff["council.maxRounds"]).toEqual({ value: 2, source: "default" });
  });

  it("ignores a value stored at a scope the key doesn't allow", () => {
    const eff = resolveSettings([row("user", USER, "council.maxRounds", 4)], { projectId: null, userId: USER });
    expect(eff["council.maxRounds"]?.source).toBe("default");
  });

  it("clamps a capped user value to the project value", () => {
    const rows = [row("project", PROJECT, "council.tokenBudget", 100_000), row("user", USER, "council.tokenBudget", 400_000)];
    expect(resolveSettings(rows, { projectId: PROJECT, userId: USER })["council.tokenBudget"]).toEqual({ value: 100_000, source: "project" });
    const lower = [row("project", PROJECT, "council.tokenBudget", 100_000), row("user", USER, "council.tokenBudget", 50_000)];
    expect(resolveSettings(lower, { projectId: PROJECT, userId: USER })["council.tokenBudget"]).toEqual({ value: 50_000, source: "user" });
  });
});

describe("runtimeSettings", () => {
  it("sends only runtime-owned values that were set", () => {
    const rows = [row("global", null, "council.maxRounds", 3), row("global", null, "governance.approvalSlaHours", 24)];
    expect(runtimeSettings(resolveSettings(rows, { projectId: null, userId: null }))).toEqual({ "council.maxRounds": 3 });
  });
});

describe("capFor", () => {
  it("returns the shared limit for capped keys only", () => {
    const eff = resolveSettings([row("global", null, "council.tokenBudget", 200_000)], { projectId: null, userId: null });
    expect(capFor(settingDefinition("council.tokenBudget")!, eff)).toBe(200_000);
    expect(capFor(settingDefinition("council.maxRounds")!, eff)).toBeNull();
  });
});

describe("authorizeTarget", () => {
  const mode = settingDefinition("council.mode")!;
  const rounds = settingDefinition("council.maxRounds")!;

  it("lets any user set their own preference, never someone else's", () => {
    expect(authorizeTarget(mode, { scope: "user", scopeId: "someone-else" }, user("developer"))).toEqual({ scope: "user", scopeId: USER });
  });

  it("lets only admins change shared settings", () => {
    expect(() => authorizeTarget(mode, { scope: "global", scopeId: null }, user("developer"))).toThrow(/admin/);
    expect(authorizeTarget(mode, { scope: "global", scopeId: PROJECT }, user("admin"))).toEqual({ scope: "global", scopeId: null });
    expect(authorizeTarget(mode, { scope: "project", scopeId: PROJECT }, user("admin"))).toEqual({ scope: "project", scopeId: PROJECT });
  });

  it("refuses a scope the key doesn't allow, and a project scope without a project", () => {
    expect(() => authorizeTarget(rounds, { scope: "user", scopeId: null }, user("admin"))).toThrow(/scope/);
    expect(() => authorizeTarget(mode, { scope: "project", scopeId: null }, user("admin"))).toThrow(/project id/);
  });
});
