import { describe, expect, it } from "vitest";
import {
  agentsApprovedByRole,
  assertCanRunAgent,
  canDecide,
  canEditDesignDoc,
  canReadAgent,
  canRunAgent,
  canStopRun,
  canViewTaskPrs,
  canonicalAgentId,
  delegatedAgentFromTool,
  gateInfoFor,
  gateInfoForPause,
  resolveApprover,
  rolesWithAccess,
} from "./policy.js";

describe("agent ids", () => {
  it("resolves delegate-tool short names to runtime agent ids", () => {
    expect(canonicalAgentId("po")).toBe("po-agent");
    expect(canonicalAgentId("review")).toBe("coder");
    expect(canonicalAgentId("pr")).toBe("git-agent");
    expect(canonicalAgentId("unknown")).toBe("unknown");
  });

  it("reads the delegated agent off a delegate_to_* tool name only", () => {
    expect(delegatedAgentFromTool("delegate_to_qa")).toBe("qa-agent");
    expect(delegatedAgentFromTool("delegate_to_planner")).toBe("task-planner");
    expect(delegatedAgentFromTool("ask_user")).toBeNull();
    expect(delegatedAgentFromTool(undefined)).toBeNull();
    expect(delegatedAgentFromTool("delegate_to_")).toBeNull();
  });
});

describe("role x agent grants", () => {
  it("lets the developer run the VS Code agents and read architecture and QA", () => {
    for (const agent of ["vscode-agent", "task-planner", "coder", "git-agent"]) expect(canRunAgent("developer", agent)).toBe(true);
    expect(canReadAgent("developer", "architect-agent")).toBe(true);
    expect(canRunAgent("developer", "qa-agent")).toBe(false);
    expect(canRunAgent("developer", "orchestrator")).toBe(false);
  });

  it("keeps the project owner away from code", () => {
    expect(canReadAgent("project_owner", "coder")).toBe(false);
    expect(canViewTaskPrs("project_owner")).toBe(false);
  });

  it("gives admins read on everything and run on nothing", () => {
    expect(canReadAgent("admin", "coder")).toBe(true);
    expect(canRunAgent("admin", "orchestrator")).toBe(false);
  });

  it("denies by default for agents missing from a role's row", () => {
    expect(canReadAgent("deployer", "coder")).toBe(false);
    expect(canReadAgent("qa_engineer", "po-agent")).toBe(false);
    expect(canReadAgent("developer", "unknown-agent")).toBe(false);
  });

  it("throws a forbidden error when a role runs an agent it may only read", () => {
    expect(() => assertCanRunAgent("architect", "vscode-agent")).toThrow(/not granted/);
    expect(() => assertCanRunAgent("developer", "vscode-agent")).not.toThrow();
  });

  it("lists exactly the roles with a given access", () => {
    expect(rolesWithAccess("coder", "run")).toEqual(["developer"]);
    expect(rolesWithAccess("qa-agent", "run")).toEqual(["qa_engineer"]);
  });
});

describe("document and pull request access", () => {
  it("lets only the owning role edit design documents", () => {
    expect(canEditDesignDoc("architect", "architect-agent")).toBe(true);
    expect(canEditDesignDoc("developer", "architect-agent")).toBe(false);
    expect(canEditDesignDoc("qa_engineer", "qa-agent")).toBe(true);
  });

  it("shows Task pull requests to BA, architect, developer, QA and deployer", () => {
    for (const role of ["business_analyst", "architect", "developer", "qa_engineer", "deployer"] as const) expect(canViewTaskPrs(role)).toBe(true);
  });
});

describe("approvals", () => {
  it("routes each web gate to its approver role", () => {
    expect(resolveApprover("po", "u1").requiredRole).toBe("project_owner");
    expect(resolveApprover("qa-agent", "u1").requiredRole).toBe("qa_engineer");
    expect(resolveApprover("deployer-agent", "u1").requiredRole).toBe("deployer");
  });

  it("lets only the required role decide a gate, admins cannot stand in", () => {
    const scope = resolveApprover("architect-agent", "requester");
    expect(canDecide({ id: "x", role: "architect" }, scope)).toBe(true);
    expect(canDecide({ id: "x", role: "admin" }, scope)).toBe(false);
    expect(canDecide({ id: "requester", role: "qa_engineer" }, scope)).toBe(false);
  });

  it("sends a question with no producing agent back to whoever started the run", () => {
    const scope = resolveApprover(null, "requester");
    expect(canDecide({ id: "requester", role: "project_owner" }, scope)).toBe(true);
    expect(canDecide({ id: "someone-else", role: "project_owner" }, scope)).toBe(false);
  });

  it("maps gates to agents, the test plan has no number", () => {
    expect(gateInfoFor("po")?.gate).toBe(1);
    expect(gateInfoFor("qa-agent")?.gate).toBeNull();
    expect(gateInfoFor("deploy")?.gate).toBe(8);
    expect(gateInfoFor(null)).toBeNull();
    expect(agentsApprovedByRole("qa_engineer")).toEqual(["qa-agent"]);
  });
});

describe("canStopRun", () => {
  it("lets the requester and admins stop a run, nobody else", () => {
    expect(canStopRun({ id: "u1", role: "developer" }, { requestedBy: "u1" })).toBe(true);
    expect(canStopRun({ id: "a1", role: "admin" }, { requestedBy: "u1" })).toBe(true);
    expect(canStopRun({ id: "u2", role: "developer" }, { requestedBy: "u1" })).toBe(false);
  });
});

describe("VS Code gates", () => {
  it("names gates 4 to 6 and lets the developer who started the run decide", () => {
    expect(gateInfoForPause("task-planner", [{ label: "Approve" }, { label: "Revise" }])).toMatchObject({ gate: 4 });
    expect(gateInfoForPause("coder", [{ label: "Approve" }])).toMatchObject({ gate: 5 });
    expect(gateInfoForPause("git-agent", [{ label: "Approve" }])).toMatchObject({ gate: 6, name: "Pull request" });
    expect(gateInfoForPause("coder", [{ label: "Yes" }])).toBeNull();
    const scope = resolveApprover("task-planner", "dev-1");
    expect(scope.requiredRole).toBeNull();
    expect(canDecide({ id: "dev-1", role: "developer" }, scope)).toBe(true);
    expect(canDecide({ id: "dev-2", role: "developer" }, scope)).toBe(false);
  });
});
