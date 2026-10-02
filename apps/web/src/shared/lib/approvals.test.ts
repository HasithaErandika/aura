import { describe, expect, it } from "vitest";
import type { Approval } from "../api/types.ts";
import { countPending, toPendingGate } from "./approvals.ts";

const approval = (over: Partial<Approval>): Approval => ({
  id: "a1",
  runId: "r1",
  threadId: "t1",
  agentId: "orchestrator",
  producingAgent: "qa-agent",
  gate: { number: null, name: "Test plan approval", outcome: "Saved" },
  requiredRole: "qa_engineer",
  requestedBy: "u1",
  question: "Approve?",
  options: [{ label: "Approve" }],
  selectionMode: "single_select",
  snapshot: "# Plan",
  snapshotHash: "h",
  status: "PENDING",
  requestedAt: "",
  expiresAt: "",
  decidedAt: null,
  ...over,
});

describe("approval mappers", () => {
  it("maps an approval to the gate the decision card shows", () => {
    expect(toPendingGate(approval({ canDecide: undefined }))).toMatchObject({ approvalId: "a1", snapshotHash: "h", canDecide: false, gate: { number: null } });
  });

  it("counts pending requests and those the user decides", () => {
    expect(countPending([approval({}), approval({ id: "a2", canDecide: true }), approval({ id: "a3", status: "APPROVED", canDecide: true })])).toEqual({ pending: 2, mine: 1 });
  });
});
