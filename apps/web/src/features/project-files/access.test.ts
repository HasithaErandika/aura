import { describe, expect, it } from "vitest";
import type { Me } from "../../types/api.ts";
import { projectFilesAccess } from "./access.ts";

// Pins the Project Files role matrix (access.ts, docs/ARCHITECTURE.md section 2.9). The grants
// below mirror apps/api policy.ts ROLE_AGENT_GRANTS - the same data GET /me returns.
const GRANTS: Record<string, Record<string, "run" | "read">> = {
  project_owner: { orchestrator: "run", "po-agent": "run", "ba-agent": "read", "deployer-agent": "read" },
  business_analyst: { orchestrator: "run", "ba-agent": "run", "po-agent": "read", "qa-agent": "read" },
  architect: { orchestrator: "run", "architect-agent": "run", "ba-agent": "read", "dev-agent": "read", "coding-agent": "read", "coding-council": "read", "qa-agent": "read", "tester-agent": "read", "deployer-agent": "read" },
  developer: { orchestrator: "run", "dev-agent": "run", "coding-agent": "run", "coding-council": "run", "git-tool": "run", "architect-agent": "read", "qa-agent": "read" },
  qa_engineer: { orchestrator: "run", "qa-agent": "run", "tester-agent": "run", "dev-agent": "read" },
  deployer: { orchestrator: "run", "deployer-agent": "run", "qa-agent": "read" },
  admin: { orchestrator: "read", "po-agent": "read", "dev-agent": "read", "qa-agent": "read", "architect-agent": "read" },
};

const me = (role: Me["role"]) => ({ id: "u", email: "u@x", fullName: null, role, roleLabel: role, grants: { agents: GRANTS[role], approves: [] } }) as unknown as Me;

describe("Project Files access by role", () => {
  it("PO: design docs only (read + comment), no code, no QA, no panel", () => {
    const a = projectFilesAccess(me("project_owner"));
    expect(a.see).toEqual({ design: true, qa: false, code: false });
    expect(a.edit).toEqual({ design: false, qa: false, code: false });
    expect(a.commentOnDesign).toBe(true);
    expect(a.panelTabs).toEqual([]);
    expect(a.defaultSection).toBe("design");
  });

  it("BA: design (comment) and QA read, test runs, no code", () => {
    const a = projectFilesAccess(me("business_analyst"));
    expect(a.see).toEqual({ design: true, qa: true, code: false });
    expect(a.commentOnDesign).toBe(true);
    expect(a.panelTabs).toEqual(["tests"]);
  });

  it("Architect: edits design, reads QA and code, sees tests and runners, no terminal", () => {
    const a = projectFilesAccess(me("architect"));
    expect(a.see).toEqual({ design: true, qa: true, code: true });
    expect(a.edit).toEqual({ design: true, qa: false, code: false });
    expect(a.terminal).toBe(false);
    expect(a.panelTabs).toEqual(["tests", "runners"]);
    expect(a.defaultSection).toBe("design");
  });

  it("Developer: edits code, reads design and QA, terminal first, can code a Task and run CI", () => {
    const a = projectFilesAccess(me("developer"));
    expect(a.see).toEqual({ design: true, qa: true, code: true });
    expect(a.edit).toEqual({ design: false, qa: false, code: true });
    expect(a.panelTabs).toEqual(["terminal", "tests", "runners"]);
    expect(a.defaultTab).toBe("terminal");
    expect(a.defaultSection).toBe("code");
    expect(a.codeTask).toBe(true);
    expect(a.runCi).toBe(true);
    expect(a.runTests).toBe(false);
    expect(a.commentOnDesign).toBe(false);
  });

  it("QA Engineer: edits QA, reads code, test runs first, can run tests and CI", () => {
    const a = projectFilesAccess(me("qa_engineer"));
    expect(a.see).toEqual({ design: true, qa: true, code: true });
    expect(a.edit).toEqual({ design: false, qa: true, code: false });
    expect(a.defaultSection).toBe("qa");
    expect(a.defaultTab).toBe("tests");
    expect(a.runTests).toBe(true);
    expect(a.runCi).toBe(true);
    expect(a.codeTask).toBe(false);
    expect(a.terminal).toBe(false);
  });

  it("Deployer: design and QA read, no code", () => {
    const a = projectFilesAccess(me("deployer"));
    expect(a.see).toEqual({ design: true, qa: true, code: false });
    expect(a.edit).toEqual({ design: false, qa: false, code: false });
  });

  it("Admin: reads everything, edits nothing, no actions", () => {
    const a = projectFilesAccess(me("admin"));
    expect(a.see).toEqual({ design: true, qa: true, code: true });
    expect(a.edit).toEqual({ design: false, qa: false, code: false });
    expect([a.terminal, a.runCi, a.runTests, a.codeTask, a.commentOnDesign]).toEqual([false, false, false, false, false]);
  });

  it("nobody signed in: sees nothing", () => {
    const a = projectFilesAccess(null);
    expect(a.see).toEqual({ design: false, qa: false, code: false });
    expect(a.panelTabs).toEqual([]);
  });
});
