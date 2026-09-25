import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptForRuntime, signTerminalTicket } from "./ticket.js";

// Contract with apps/agent-runtime terminal/ticket.ts: these tests verify and decrypt exactly the
// way the runtime does, so a change on either side that breaks the other fails here.

const secret = "x".repeat(40);

function runtimeVerify(ticket: string): Record<string, unknown> | null {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  if (createHmac("sha256", secret).update(payload).digest("base64url") !== signature) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

function runtimeDecrypt(encrypted: string, key = secret): string {
  const [iv, tag, body] = encrypted.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(`aura-terminal-cli-token:${key}`).digest(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString("utf8");
}

const payload = { userId: "u1", role: "developer", epicKey: "KAN-36", discipline: "Backend", taskKey: "KAN-47", exp: Date.now() + 60_000 };

describe("terminal tickets", () => {
  it("signs a payload the runtime can verify, with a nonce added", () => {
    const verified = runtimeVerify(signTerminalTicket(payload, secret));
    expect(verified).toMatchObject(payload);
    expect(typeof verified?.nonce).toBe("string");
  });

  it("gives every ticket a different nonce (single use on the runtime side)", () => {
    const a = runtimeVerify(signTerminalTicket(payload, secret));
    const b = runtimeVerify(signTerminalTicket(payload, secret));
    expect(a?.nonce).not.toBe(b?.nonce);
  });

  it("produces a ticket that fails verification once tampered with", () => {
    const ticket = signTerminalTicket(payload, secret);
    const [body, sig] = ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "admin" })).toString("base64url");
    expect(runtimeVerify(`${forged}.${sig}`)).toBeNull();
    expect(runtimeVerify(`${body}.${sig}`)).not.toBeNull();
  });

  it("encrypts the CLI token so only the runtime secret can read it", () => {
    const encrypted = encryptForRuntime("aura_pat_secret-value", secret);
    expect(encrypted).not.toContain("aura_pat_");
    expect(runtimeDecrypt(encrypted)).toBe("aura_pat_secret-value");
    expect(() => runtimeDecrypt(encrypted, "y".repeat(40))).toThrow();
  });
});
