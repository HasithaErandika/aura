import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHs256 } from "./jwt.js";

const secret = "test-secret";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sign(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }, key = secret): string {
  const unsigned = `${b64(header)}.${b64(claims)}`;
  return `${unsigned}.${createHmac("sha256", key).update(unsigned).digest("base64url")}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe("verifyHs256", () => {
  it("accepts a valid, unexpired token and returns its claims", () => {
    const claims = verifyHs256(sign({ sub: "user-1", email: "a@b.c", exp: future(), aud: "authenticated" }), secret);
    expect(claims?.sub).toBe("user-1");
    expect(claims?.email).toBe("a@b.c");
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyHs256(sign({ sub: "u", exp: future() }, undefined, "other"), secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(verifyHs256(sign({ sub: "u", exp: Math.floor(Date.now() / 1000) - 10 }), secret)).toBeNull();
  });

  it("rejects any algorithm other than HS256 (no alg=none downgrade)", () => {
    expect(verifyHs256(sign({ sub: "u", exp: future() }, { alg: "none" }), secret)).toBeNull();
  });

  it("rejects a token for another audience", () => {
    expect(verifyHs256(sign({ sub: "u", exp: future(), aud: "service_role" }), secret)).toBeNull();
  });

  it("rejects malformed input and missing claims", () => {
    expect(verifyHs256("not-a-jwt", secret)).toBeNull();
    expect(verifyHs256(sign({ exp: future() }), secret)).toBeNull();
    expect(verifyHs256(sign({ sub: "u" }), secret)).toBeNull();
  });
});
