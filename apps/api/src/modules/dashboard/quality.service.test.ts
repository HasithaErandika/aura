import { describe, expect, it } from "vitest";
import { aggregateQuality, type QualityInputRow } from "./quality.service.js";

const row = (agent: string | null, thread: string, at: string, decision: string | null, status = "APPROVED", decidedAt: string | null = null): QualityInputRow => ({
  producing_agent: agent,
  thread_id: thread,
  status,
  requested_at: at,
  decided_at: decidedAt,
  approval_decisions: decision ? [{ decision, created_at: decidedAt ?? at }] : [],
});

describe("aggregateQuality", () => {
  it("computes approval, first-pass and decision-time metrics per agent", () => {
    const rows = [
      row("ba", "t1", "2026-09-01T10:00:00Z", "revise", "REVISED", "2026-09-01T10:10:00Z"),
      row("ba", "t1", "2026-09-01T11:00:00Z", "approve", "APPROVED", "2026-09-01T11:30:00Z"),
      row("ba", "t2", "2026-09-02T10:00:00Z", "approve", "APPROVED", "2026-09-02T10:20:00Z"),
      row("ba", "t3", "2026-09-03T10:00:00Z", null, "PENDING"),
      row("po", "t4", "2026-09-03T10:00:00Z", "reject", "REJECTED", "2026-09-03T10:05:00Z"),
      row("po", "t5", "2026-09-04T10:00:00Z", null, "EXPIRED"),
      row(null, "t6", "2026-09-04T10:00:00Z", "answer"),
    ];
    const [ba, po] = aggregateQuality(rows);
    expect(ba).toMatchObject({ agent: "ba", gates: 4, decided: 3, approve: 2, revise: 1, pending: 1, approvalRate: 0.667, firstPassRate: 0.5, medianDecisionMinutes: 20 });
    expect(po).toMatchObject({ agent: "po", gates: 2, decided: 1, reject: 1, expired: 1, approvalRate: 0, firstPassRate: 0, medianDecisionMinutes: 5 });
  });

  it("returns nulls when nothing was decided", () => {
    expect(aggregateQuality([row("qa", "t", "2026-09-01T00:00:00Z", null, "PENDING")])[0]).toMatchObject({ approvalRate: null, firstPassRate: null, medianDecisionMinutes: null });
  });
});
