import { describe, expect, it } from "vitest";
import { safeJson } from "./json.js";

describe("safeJson", () => {
  it("parses JSON", () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns truncated text when the body is not JSON", () => {
    expect(safeJson("<html>oops</html>", 6)).toBe("<html>");
  });
});
