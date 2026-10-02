import { describe, expect, it } from "vitest";
import { dbError, isUniqueViolation, orValue } from "./db.js";

describe("dbError", () => {
  it("prefixes the context", () => {
    expect(dbError("list runs", { message: "boom" }).message).toBe("list runs: boom");
  });

  it.each(["42P01", "42703", "PGRST204", "PGRST205"])("hints at pending migrations for %s", (code) => {
    expect(dbError("x", { message: "missing", code }).message).toContain("apply the pending supabase/migrations");
  });

  it("hints at pending migrations when a relation does not exist", () => {
    expect(dbError("x", { message: 'relation "foo" does not exist' }).message).toContain("pending supabase/migrations");
  });
});

describe("isUniqueViolation", () => {
  it("matches only 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("orValue", () => {
  it("passes identifiers through", () => {
    expect(orValue("3f1c-ab_9", "project")).toBe("3f1c-ab_9");
  });

  it.each(["a,b", "a.eq.b", "x)", "", "a b"])("rejects %j", (value) => {
    expect(() => orValue(value, "project")).toThrow(/Unsafe value/);
  });
});
