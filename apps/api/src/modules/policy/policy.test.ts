import { describe, expect, it } from "vitest";
import {
  agentsApprovedByRole,
  assertCanRunAgent,
  canDecide,
  canEditArchitectWorkspace,
  canEditDevWorkspace,
  canEditQaWorkspace,
  canReadAgent,
  canRunAgent,
  canViewDevWorkspace,
  canViewQaWorkspace,
  canonicalAgentId,
  delegatedAgentFromTool,
  gateInfoFor,
  resolveApprover,
  rolesWithAccess,
} from "./policy.js";

// The policy tables are AURA's authorization - these tests pin the role x agent matrix so a
// change to it is always deliberate (docs/ARCHITECTURE.md section 2.2, project-files/access.ts).

describe("agent ids", () => {
  it("resolves delegate-tool short names to runtime agent ids", () => {
    expect(canonicalAgentId("code")).toBe("coding-agent");
    expect(canonicalAgentId("po")).toBe("po-agent");
    expect(canonicalAgentId("coding-council")).toBe("coding-council");
  });

  it("reads the delegated agent off a delegate_to_* tool name only", () => {
    expect(delegatedAgentFromTool("delegate_to_code")).toBe("coding-agent");
    expect(delegatedAgentFromTool("delegate_to_test")).toBe("tester-agent");
    expect(delegatedAgentFromTool("ask_user")).toBeNull();
    expect(delegatedAgentFromTool(undefined)).toBeNull();
    expect(delegatedAgentFromTool("delegate_to_")).toBeNull();
  });
});

describe("role x agent grants", () => {
  it("lets the developer run dev, coding, the council and git, and read architecture and QA", () => {
    for (const agent of ["dev-agent", "coding-agent", "coding-council", "git-tool"]) expect(canRunAgent("developer", agent)).toBe(true);
    expect(canReadAgent("developer", "architect-agent")).toBe(true);
    expect(canReadAgent("developer", "qa-agent")).toBe(true);
    expect(canRunAgent("developer", "qa-agent")).toBe(false);
  });

  it("keeps the project owner away from code", () => {
    expect(canReadAgent("project_owner", "dev-agent")).toBe(false);
    expect(canReadAgent("project_owner", "coding-agent")).toBe(false);
    expect(canViewDevWorkspace("project_owner")).toBe(false);
  });

  it("gives admins read on everything and run on nothing", () => {
    expect(canReadAgent("admin", "coding-council")).toBe(true);
    expect(canRunAgent("admin", "orchestrator")).toBe(false);
    expect(canRunAgent("admin", "dev-agent")).toBe(false);
  });

  it("denies by default for agents missing from a role's row", () => {
    expect(canReadAgent("deployer", "dev-agent")).toBe(false);
    expect(canReadAgent("qa_engineer", "po-agent")).toBe(false);
    expect(canReadAgent("developer", "unknown-agent")).toBe(false);
  });

  it("throws a forbidden error when a role runs an agent it may only read", () => {
    expect(() => assertCanRunAgent("architect", "dev-agent")).toThrow(/not granted/);
    expect(() => assertCanRunAgent("developer", "dev-agent")).not.toThrow();
  });

  it("lists exactly the roles with a given access", () => {
    expect(rolesWithAccess("coding-council", "run")).toEqual(["developer"]);
    expect(rolesWithAccess("qa-agent", "run")).toEqual(["qa_engineer"]);
  });
});

describe("workspace view and edit rules", () => {
  it("lets only the owning role edit each workspace", () => {
    expect(canEditArchitectWorkspace("architect")).toBe(true);
    expect(canEditArchitectWorkspace("developer")).toBe(false);
    expect(canEditDevWorkspace("developer")).toBe(true);
    expect(canEditDevWorkspace("architect")).toBe(false);
    expect(canEditQaWorkspace("qa_engineer")).toBe(true);
    expect(canEditQaWorkspace("developer")).toBe(false);
  });

  it("shows the QA workspace to BA, architect, developer, QA and deployer - not the PO", () => {
    for (const role of ["business_analyst", "architect", "developer", "qa_engineer", "deployer"] as const) expect(canViewQaWorkspace(role)).toBe(true);
    expect(canViewQaWorkspace("project_owner")).toBe(false);
  });
});

describe("approvals", () => {
  it("routes each gate to its approver role", () => {
    expect(resolveApprover("delegate_to_code".replace("delegate_to_", ""), "u1").requiredRole).toBe("developer");
    expect(resolveApprover("tester-agent", "u1").requiredRole).toBe("qa_engineer");
    expect(resolveApprover("coding-council", "u1").requiredRole).toBe("developer");
  });

  it("lets only the required role decide a gate - admins cannot stand in", () => {
    const scope = resolveApprover("coding-agent", "requester");
    expect(canDecide({ id: "x", role: "developer" }, scope)).toBe(true);
    expect(canDecide({ id: "x", role: "admin" }, scope)).toBe(false);
    expect(canDecide({ id: "requester", role: "qa_engineer" }, scope)).toBe(false);
  });

  it("sends a question with no producing agent back to whoever started the run", () => {
    const scope = resolveApprover(null, "requester");
    expect(canDecide({ id: "requester", role: "project_owner" }, scope)).toBe(true);
    expect(canDecide({ id: "someone-else", role: "project_owner" }, scope)).toBe(false);
  });

  it("maps gates to agents, including the council", () => {
    expect(gateInfoFor("coding-agent")?.gate).toBe(5);
    expect(gateInfoFor("coding-council")?.gate).toBe(5);
    expect(gateInfoFor("po")?.gate).toBe(1);
    expect(gateInfoFor(null)).toBeNull();
    expect(agentsApprovedByRole("qa_engineer").sort()).toEqual(["qa-agent", "tester-agent"]);
  });
});
