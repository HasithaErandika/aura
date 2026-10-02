import { describe, expect, it } from "vitest";
import { safeEqual, sha256 } from "./hash.js";

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
});
