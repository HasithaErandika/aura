import { describe, expect, it } from "vitest";
import { hmacSha256, safeEqual, sha256 } from "./hash.js";

describe("hash", () => {
  it("hashes with sha256 hex", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("compares strings of any length safely", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "tokem")).toBe(false);
    expect(safeEqual("token", "token-longer")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("signs with HMAC-SHA256 hex", () => {
    // GitHub's documented example: secret "It's a Secret to Everybody", body "Hello, World!".
    expect(hmacSha256("It's a Secret to Everybody", "Hello, World!")).toBe("757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17");
  });
});
