import { randomBytes, randomInt } from "node:crypto";

const TTL_MS = 10 * 60_000;
const POLL_INTERVAL_S = 2;
// No vowels or look-alikes, so a code never spells a word.
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";

type DeviceState = "pending" | "approved" | "denied";

interface DeviceGrant {
  deviceCode: string;
  userCode: string;
  clientName: string;
  createdAt: number;
  expiresAt: number;
  state: DeviceState;
  token: string | null;
  userId: string | null;
}

export type PollResult =
  | { status: "authorization_pending" }
  | { status: "slow_down" }
  | { status: "access_denied" }
  | { status: "expired_token" }
  | { status: "approved"; token: string; userId: string };

function userCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizeUserCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export class DeviceAuthStore {
  private readonly byDevice = new Map<string, DeviceGrant>();
  private readonly byUser = new Map<string, string>();
  private readonly lastPoll = new Map<string, number>();

  start(clientName: string, now = Date.now()) {
    this.sweep(now);
    let code = userCode();
    while (this.byUser.has(code)) code = userCode();
    const grant: DeviceGrant = {
      deviceCode: randomBytes(32).toString("base64url"),
      userCode: code,
      clientName: clientName.slice(0, 80),
      createdAt: now,
      expiresAt: now + TTL_MS,
      state: "pending",
      token: null,
      userId: null,
    };
    this.byDevice.set(grant.deviceCode, grant);
    this.byUser.set(grant.userCode, grant.deviceCode);
    return { deviceCode: grant.deviceCode, userCode: grant.userCode, expiresIn: TTL_MS / 1000, interval: POLL_INTERVAL_S };
  }

  lookup(code: string, now = Date.now()): { userCode: string; clientName: string; expiresAt: string } | null {
    const grant = this.grantByUserCode(code, now);
    return grant && grant.state === "pending" ? { userCode: grant.userCode, clientName: grant.clientName, expiresAt: new Date(grant.expiresAt).toISOString() } : null;
  }

  async approve(code: string, userId: string, mint: (clientName: string) => Promise<string>, now = Date.now()): Promise<boolean> {
    const grant = this.grantByUserCode(code, now);
    if (!grant || grant.state !== "pending") return false;
    grant.state = "approved";
    grant.userId = userId;
    grant.token = await mint(grant.clientName);
    return true;
  }

  deny(code: string, now = Date.now()): boolean {
    const grant = this.grantByUserCode(code, now);
    if (!grant || grant.state !== "pending") return false;
    grant.state = "denied";
    return true;
  }

  // An approved grant hands its token over once, then is gone.
  poll(deviceCode: string, now = Date.now()): PollResult {
    const grant = this.byDevice.get(deviceCode);
    if (!grant || grant.expiresAt <= now) {
      if (grant) this.remove(grant);
      return { status: "expired_token" };
    }
    const last = this.lastPoll.get(deviceCode);
    this.lastPoll.set(deviceCode, now);
    if (grant.state === "denied") {
      this.remove(grant);
      return { status: "access_denied" };
    }
    if (grant.state === "approved" && grant.token && grant.userId) {
      this.remove(grant);
      return { status: "approved", token: grant.token, userId: grant.userId };
    }
    if (last !== undefined && now - last < (POLL_INTERVAL_S * 1000) / 2) return { status: "slow_down" };
    return { status: "authorization_pending" };
  }

  private grantByUserCode(code: string, now: number): DeviceGrant | null {
    const deviceCode = this.byUser.get(normalizeUserCode(code));
    const grant = deviceCode ? this.byDevice.get(deviceCode) : undefined;
    if (!grant) return null;
    if (grant.expiresAt <= now) {
      this.remove(grant);
      return null;
    }
    return grant;
  }

  private remove(grant: DeviceGrant) {
    this.byDevice.delete(grant.deviceCode);
    this.byUser.delete(grant.userCode);
    this.lastPoll.delete(grant.deviceCode);
  }

  private sweep(now: number) {
    for (const grant of this.byDevice.values()) if (grant.expiresAt <= now) this.remove(grant);
  }
}

export const deviceAuth = new DeviceAuthStore();
