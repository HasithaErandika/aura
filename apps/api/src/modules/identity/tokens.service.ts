import { randomBytes } from "node:crypto";
import { sha256 } from "../../lib/hash.js";
import { errorMessage, logger } from "../../lib/logger.js";
import type { TokenRow, TokenView } from "./identity.types.js";
import { tokensRepository } from "./tokens.repository.js";

const TOKEN_PREFIX = "aura_pat_";
const DISPLAY_PREFIX_CHARS = TOKEN_PREFIX.length + 4;
const TOUCH_INTERVAL_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const lastTouched = new Map<string, number>();

function toTokenView(row: TokenRow, now = Date.now()): TokenView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revoked: row.revoked_at !== null,
    expired: new Date(row.expires_at).getTime() <= now,
  };
}

export function isAccessToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export async function createToken(userId: string, name: string, lifetimeDays: number): Promise<{ token: string; view: TokenView }> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await tokensRepository.insert({
    userId,
    name,
    tokenHash: sha256(token),
    prefix: token.slice(0, DISPLAY_PREFIX_CHARS),
    expiresAt: new Date(Date.now() + lifetimeDays * DAY_MS).toISOString(),
  });
  return { token, view: toTokenView(row) };
}

export async function listTokens(userId: string): Promise<TokenView[]> {
  return (await tokensRepository.listForUser(userId)).map((row) => toTokenView(row));
}

export function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  return tokensRepository.revoke(userId, tokenId);
}

export async function resolveToken(token: string): Promise<string | null> {
  const row = await tokensRepository.findByHash(sha256(token)).catch(() => null);
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const now = Date.now();
  if ((lastTouched.get(row.id) ?? 0) + TOUCH_INTERVAL_MS < now) {
    lastTouched.set(row.id, now);
    await tokensRepository.touch(row.id, new Date(now).toISOString()).catch((error) => logger.warn("could not record access token use", { tokenId: row.id, message: errorMessage(error) }));
  }
  return row.user_id;
}
