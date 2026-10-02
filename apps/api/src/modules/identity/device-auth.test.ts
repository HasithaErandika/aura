import { describe, expect, it } from "vitest";
import { DeviceAuthStore, normalizeUserCode } from "./device-auth.js";

const mint = async (name: string) => `aura_pat_${name}`;

describe("DeviceAuthStore", () => {
  it("hands the token over once after the developer approves", async () => {
    const store = new DeviceAuthStore();
    const { deviceCode, userCode } = store.start("VS Code on laptop", 0);
    expect(userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(store.poll(deviceCode, 0)).toEqual({ status: "authorization_pending" });
    expect(store.lookup(userCode.toLowerCase().replace("-", " "), 1000)).toMatchObject({ clientName: "VS Code on laptop" });
    expect(await store.approve(userCode, "u1", mint, 2000)).toBe(true);
    expect(store.poll(deviceCode, 5000)).toEqual({ status: "approved", token: "aura_pat_VS Code on laptop", userId: "u1" });
    expect(store.poll(deviceCode, 9000)).toEqual({ status: "expired_token" });
  });

  it("can't be approved twice, or after it expires", async () => {
    const store = new DeviceAuthStore();
    const a = store.start("x", 0);
    expect(await store.approve(a.userCode, "u1", mint, 1000)).toBe(true);
    expect(await store.approve(a.userCode, "u2", mint, 1000)).toBe(false);
    const b = store.start("y", 0);
    expect(await store.approve(b.userCode, "u1", mint, 11 * 60_000)).toBe(false);
    expect(store.poll(b.deviceCode, 11 * 60_000)).toEqual({ status: "expired_token" });
  });

  it("reports a denial, and asks fast pollers to slow down", () => {
    const store = new DeviceAuthStore();
    const g = store.start("x", 0);
    expect(store.poll(g.deviceCode, 0)).toEqual({ status: "authorization_pending" });
    expect(store.poll(g.deviceCode, 200)).toEqual({ status: "slow_down" });
    expect(store.deny(g.userCode, 300)).toBe(true);
    expect(store.poll(g.deviceCode, 5000)).toEqual({ status: "access_denied" });
  });

  it("normalises codes typed by hand", () => {
    expect(normalizeUserCode("bcdf ghjk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("BCDF-GHJK")).toBe("BCDF-GHJK");
  });
});
