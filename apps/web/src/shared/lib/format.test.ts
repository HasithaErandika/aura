import { describe, expect, it } from "vitest";
import { duration, humanize, initials, percent, personName, timeAgo, timeUntil, truncate } from "./format.ts";

const NOW = Date.parse("2026-10-02T12:00:00Z");

describe("formatters", () => {
  it("formats relative times", () => {
    expect(timeAgo("2026-10-02T11:59:40Z", NOW)).toBe("just now");
    expect(timeAgo("2026-10-02T11:30:00Z", NOW)).toBe("30 min ago");
    expect(timeAgo("2026-10-02T09:00:00Z", NOW)).toBe("3 h ago");
    expect(timeAgo(null, NOW)).toBe("");
    expect(timeUntil("2026-10-02T11:00:00Z", NOW)).toBe("expired");
    expect(timeUntil("2026-10-02T12:20:00Z", NOW)).toBe("20 min left");
    expect(timeUntil("2026-10-06T12:00:00Z", NOW)).toBe("4 d left");
  });

  it("formats durations", () => {
    expect(duration("2026-10-02T11:59:15Z", "2026-10-02T12:00:00Z")).toBe("45s");
    expect(duration("2026-10-02T11:58:00Z", "2026-10-02T12:00:30Z")).toBe("2m 30s");
    expect(duration("2026-10-02T10:00:00Z", null, NOW)).toBe("2h 0m");
    expect(duration("bad", null, NOW)).toBe("");
  });

  it("formats names and text", () => {
    expect(initials("Nimal Perera")).toBe("NP");
    expect(initials("  ")).toBe("?");
    expect(humanize("qa_engineer")).toBe("Qa Engineer");
    expect(truncate("abcdefghij", 8)).toBe("abcde...");
    expect(truncate("short", 8)).toBe("short");
    expect(percent(0.456)).toBe("46%");
    expect(percent(null)).toBe("-");
    expect(personName({ fullName: null, email: "a@b.c" })).toBe("a@b.c");
    expect(personName(null, "system")).toBe("system");
  });
});
