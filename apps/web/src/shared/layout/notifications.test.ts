import { describe, expect, it } from "vitest";
import { badgeCount, inAppLink } from "./notification-links.ts";
import { ciBadge, ciDetail } from "../../features/design-docs/ci.ts";

describe("notifications and the QA page's CI column", () => {
  it("follows only links inside the app", () => {
    expect(inAppLink("/app/qa?task=KAN-45")).toBe("/app/qa?task=KAN-45");
    expect(inAppLink("https://evil.example")).toBeNull();
    expect(inAppLink("//evil.example/app/qa")).toBeNull();
    expect(inAppLink("javascript:alert(1)")).toBeNull();
    expect(inAppLink(null)).toBeNull();
    expect(badgeCount(3)).toBe("3");
    expect(badgeCount(12)).toBe("9+");
  });

  it("labels CI and summarises tests or failed jobs", () => {
    expect(ciBadge("failure")).toEqual({ tone: "danger", label: "CI failed" });
    expect(ciBadge(null).label).toBe("No CI yet");
    expect(ciDetail({ ciSummary: { tests: { passed: 10, failed: 1, skipped: 2 } } })).toBe("10 passed, 1 failed, 2 skipped");
    expect(ciDetail({ ciSummary: { jobs: [{ name: "frontend", result: "failure" }, { name: "backend", result: "success" }] } })).toBe("Failed: frontend");
    expect(ciDetail({ ciSummary: {} })).toBe("");
  });
});
