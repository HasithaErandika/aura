import { describe, expect, it } from "vitest";
import { readyOffers } from "./ready-tasks.js";

const n = (id: string, over: Partial<{ kind: string; readAt: string | null; taskKey: string | null }> = {}) => ({ id, kind: "task_ready", readAt: null, taskKey: "KAN-45", ...over });

describe("Tasks offered from Jira", () => {
  it("offers each unread ready Task once", () => {
    const list = [n("1"), n("2", { readAt: "2026-10-02T10:00:00Z" }), n("3", { kind: "ci_failed" }), n("4", { taskKey: null }), n("5")];
    expect(readyOffers(list, new Set()).map((x) => x.id)).toEqual(["1", "5"]);
    expect(readyOffers(list, new Set(["1"])).map((x) => x.id)).toEqual(["5"]);
  });
});
