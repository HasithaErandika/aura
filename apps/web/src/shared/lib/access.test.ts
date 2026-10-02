import { describe, expect, it } from "vitest";
import type { Me } from "../api/types.ts";
import { canUseWorkspace, canViewTaskPrs, hasAnyGrant, takesPartInRuns, worksInVsCode } from "./access.ts";

const me = (role: Me["role"], agents: Me["grants"]["agents"], approves: string[] = []): Me => ({ id: "u", email: "u@x", fullName: null, role, roleLabel: role, grants: { agents, approves } });

describe("access predicates", () => {
  it("gives the web workspace only to roles that run the Orchestrator", () => {
    expect(canUseWorkspace(me("project_owner", { orchestrator: "run" }))).toBe(true);
    expect(canUseWorkspace(me("developer", { "vscode-agent": "run" }))).toBe(false);
    expect(worksInVsCode(me("developer", { "vscode-agent": "run" }))).toBe(true);
  });

  it("follows grants for runs, Task pull requests and pipeline pages", () => {
    expect(canViewTaskPrs(me("project_owner", { orchestrator: "run" }))).toBe(false);
    expect(canViewTaskPrs(me("deployer", { "qa-agent": "read" }))).toBe(true);
    expect(takesPartInRuns(me("admin", {}))).toBe(true);
    expect(hasAnyGrant(me("admin", {}))).toBe(true);
    expect(hasAnyGrant(me("project_owner", {}))).toBe(false);
  });
});
