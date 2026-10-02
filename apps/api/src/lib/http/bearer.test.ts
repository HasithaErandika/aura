import { describe, expect, it } from "vitest";
import { bearerToken } from "./bearer.js";

describe("bearerToken", () => {
  it("reads the token, case-insensitively", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   abc ")).toBe("abc");
  });

  it.each([undefined, "", "Bearer", "Bearer ", "Basic abc", "Bearer a b", "abc"])("returns null for %j", (header) => {
    expect(bearerToken(header)).toBeNull();
  });
});
