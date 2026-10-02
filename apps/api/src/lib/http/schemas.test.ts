import { describe, expect, it } from "vitest";
import { agentIdSchema, daysQuery, enumList, jiraKeySchema, limitQuery } from "./schemas.js";

describe("http schemas", () => {
  it("accepts Jira keys only", () => {
    expect(jiraKeySchema.safeParse("KAN-36").success).toBe(true);
    expect(jiraKeySchema.safeParse("kan-36").success).toBe(false);
    expect(jiraKeySchema.safeParse("KAN36").success).toBe(false);
  });

  it("accepts safe agent ids only", () => {
    expect(agentIdSchema.safeParse("architect-agent").success).toBe(true);
    expect(agentIdSchema.safeParse("../x").success).toBe(false);
  });

  it("parses a comma list and drops unknown values", () => {
    const kinds = enumList(["a", "b"] as const);
    expect(kinds.parse("a,x,b")).toEqual(["a", "b"]);
    expect(kinds.parse(undefined)).toBeUndefined();
  });

  it("coerces and bounds a limit", () => {
    const limit = limitQuery(100, 20);
    expect(limit.parse(undefined)).toBe(20);
    expect(limit.parse("50")).toBe(50);
    expect(limit.safeParse("101").success).toBe(false);
    expect(limit.safeParse("0").success).toBe(false);
  });

  it("falls back to the default for an invalid day count", () => {
    const days = daysQuery(30);
    expect(days.parse("7")).toBe(7);
    expect(days.parse("abc")).toBe(30);
    expect(days.parse("365")).toBe(30);
    expect(days.parse(undefined)).toBe(30);
  });
});
