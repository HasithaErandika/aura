import { describe, expect, it } from "vitest";
import { buildResumeData, validateDecision } from "./approvals.service.js";
import { selectionModeOf, toGateView } from "./approvals.types.js";

const options = [{ label: "Approve and file" }, { label: "Request changes", value: "revise" }, { label: "Reject" }];

describe("buildResumeData", () => {
  it("answers with the matching option label and the human's note", () => {
    expect(buildResumeData(options, "approve", null, null)).toBe("Approve and file");
    expect(buildResumeData(options, "approve", null, "ship it")).toBe("Approve and file. Note: ship it");
    expect(buildResumeData(options, "revise", null, "add rollback")).toBe("Request changes. Feedback: add rollback");
    expect(buildResumeData(options, "reject", null, "out of scope")).toBe("Reject. Reason: out of scope");
  });

  it("falls back to the decision word, and passes free answers through", () => {
    expect(buildResumeData(null, "approve", null, null)).toBe("approve");
    expect(buildResumeData(null, "answer", "Postgres", null)).toBe("Postgres");
  });
});

describe("validateDecision", () => {
  it("requires a reason to reject or revise, and an answer to answer", () => {
    expect(() => validateDecision({ decision: "reject", answer: null, reason: null })).toThrow(/reason/);
    expect(() => validateDecision({ decision: "revise", answer: null, reason: "" })).toThrow(/reason/);
    expect(() => validateDecision({ decision: "answer", answer: null, reason: null })).toThrow(/answer/);
    expect(() => validateDecision({ decision: "approve", answer: null, reason: null })).not.toThrow();
  });
});

describe("approval view helpers", () => {
  it("maps gate info and selection modes", () => {
    expect(toGateView({ gate: 1, name: "Epic approval", outcome: "filed" })).toEqual({ number: 1, name: "Epic approval", outcome: "filed" });
    expect(toGateView(null)).toBeNull();
    expect(selectionModeOf("multi_select")).toBe("multi_select");
    expect(selectionModeOf("other")).toBeNull();
  });
});
