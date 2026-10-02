import { describe, expect, it } from "vitest";
import { replaceThread, threadTitle } from "./threads.ts";

const t = (id: string, updatedAt: string, title: string | null = null) => ({ id, title, createdAt: updatedAt, updatedAt });

describe("threadTitle", () => {
  it("falls back for empty titles", () => {
    expect(threadTitle(t("1", "2026-01-01", "  "))).toBe("Untitled conversation");
    expect(threadTitle(t("1", "2026-01-01", "Plan"))).toBe("Plan");
  });
});

describe("replaceThread", () => {
  it("replaces and keeps newest first", () => {
    const list = [t("a", "2026-01-03"), t("b", "2026-01-02")];
    expect(replaceThread(list, t("b", "2026-01-04", "New")).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("adds an unknown thread", () => {
    expect(replaceThread([], t("c", "2026-01-01"))).toHaveLength(1);
  });
});
