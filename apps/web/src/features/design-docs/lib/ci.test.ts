import { describe, expect, it } from "vitest";
import { ciBadge, ciDetail, qaBadge, qaDetail } from "./ci.ts";

describe("ciBadge", () => {
  it("labels CI states", () => {
    expect(ciBadge("failure")).toEqual({ tone: "danger", label: "CI failed" });
    expect(ciBadge(null).label).toBe("No CI yet");
  });
});

describe("ciDetail", () => {
  it("summarises tests or failed jobs", () => {
    expect(ciDetail({ ciSummary: { tests: { passed: 10, failed: 1, skipped: 2 } } })).toBe("10 passed, 1 failed, 2 skipped");
    expect(ciDetail({ ciSummary: { jobs: [{ name: "frontend", result: "failure" }, { name: "backend", result: "success" }] } })).toBe("Failed: frontend");
    expect(ciDetail({ ciSummary: { jobs: [{ name: "a", result: "success" }] } })).toBe("1 job");
    expect(ciDetail({ ciSummary: {} })).toBe("");
  });
});

describe("AURA QA check", () => {
  it("labels the check and lists what failed or was not tested", () => {
    expect(qaBadge("failure")).toEqual({ tone: "danger", label: "QA failed" });
    expect(qaBadge(null).label).toBe("No QA check yet");
    expect(qaDetail({ qaSummary: { required: ["a", "b", "c"], passed: ["a"], failed: ["b"], missing: ["c"] } })).toBe("1/3 scenarios · failed: b · not tested: c");
    expect(qaDetail({ qaSummary: { required: [], passed: [], failed: [], missing: [] } })).toBe("No scenarios linked");
    expect(qaDetail({ qaSummary: null })).toBe("");
  });
});
