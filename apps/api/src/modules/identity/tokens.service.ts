import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "../../lib/supabase.js";
import { sha256 } from "../../lib/hash.js";
import { errorMessage, logger } from "../../lib/logger.js";

// Personal access tokens for the `aura` CLI and the VS Code extension
// (supabase/migrations/0006_access_tokens_git_identity.sql). Only the SHA-256 hash is stored;
// the raw token is returned once by createToken and never again.

export const TOKEN_PREFIX = "aura_pat_";
const DISPLAY_PREFIX_CHARS = TOKEN_PREFIX.length + 4;
// last_used_at is informational; writing it on every request would turn each authenticated call
// into a database write. Once per interval per token is enough to show "last used today".
const TOUCH_INTERVAL_MS = 10 * 60_000;
const lastTouched = new Map<string, number>();

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export interface TokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revoked: boolean;
  expired: boolean;
}

function toView(row: TokenRow): TokenView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revoked: row.revoked_at !== null,
    expired: new Date(row.expires_at).getTime() <= Date.now(),
  };
}

export function isAccessToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export type TokenKind = "personal" | "terminal";

export async function createToken(userId: string, name: string, lifetimeMs: number, kind: TokenKind = "personal"): Promise<{ token: string; view: TokenView }> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const { data, error } = await supabaseAdmin
    .from("access_tokens")
    .insert({ user_id: userId, name, token_hash: sha256(token), prefix: token.slice(0, DISPLAY_PREFIX_CHARS), expires_at: expiresAt, kind })
    .select("id, user_id, name, prefix, created_at, last_used_at, expires_at, revoked_at")
    .single();
  if (error || !data) throw new Error(`could not create access token: ${error?.message ?? "no row returned"}`);
  return { token, view: toView(data as TokenRow) };
}

export async function listTokens(userId: string): Promise<TokenView[]> {
  const { data, error } = await supabaseAdmin
    .from("access_tokens")
    .select("id, user_id, name, prefix, created_at, last_used_at, expires_at, revoked_at")
    .eq("user_id", userId)
    .eq("kind", "personal")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`could not list access tokens: ${error.message}`);
  return ((data ?? []) as TokenRow[]).map(toView);
}

// Returns false when no un-revoked token with this id belongs to the user.
export async function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new Error(`could not revoke access token: ${error.message}`);
  return (data ?? []).length > 0;
}

// Resolves a raw token to its owner's user id, or null if it is unknown, revoked, or expired.
export async function resolveToken(token: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("access_tokens")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<TokenRow, "id" | "user_id" | "expires_at" | "revoked_at">;
  if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;

  const now = Date.now();
  if ((lastTouched.get(row.id) ?? 0) + TOUCH_INTERVAL_MS < now) {
    lastTouched.set(row.id, now);
    const { error: touchError } = await supabaseAdmin.from("access_tokens").update({ last_used_at: new Date(now).toISOString() }).eq("id", row.id);
    if (touchError) logger.warn("could not record access token use", { tokenId: row.id, message: errorMessage(touchError) });
  }
  return row.user_id;
}
