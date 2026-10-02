import { describe, expect, it } from "vitest";
import type { Me } from "@/shared/api/types.ts";
import { firstName, roleSummary } from "./greeting.ts";

const me = (over: Partial<Me>): Me => ({ id: "u", email: "nimal@x.io", fullName: "Nimal Perera", role: "project_owner", roleLabel: "Project Owner", grants: { agents: {}, approves: [] }, ...over });

describe("dashboard greeting", () => {
  it("uses the first name or the email", () => {
    expect(firstName(me({}))).toBe("Nimal");
    expect(firstName(me({ fullName: null }))).toBe("nimal@x.io");
  });

  it("describes what the role signs off on or where it works", () => {
    expect(roleSummary(me({ grants: { agents: { orchestrator: "run" }, approves: ["po-agent"] } }))).toBe("You are signed in as Project Owner. You sign off on PO Agent drafts.");
    expect(roleSummary(me({ role: "developer", roleLabel: "Developer", grants: { agents: { "vscode-agent": "run" }, approves: [] } }))).toContain("AURA for VS Code");
  });
});
