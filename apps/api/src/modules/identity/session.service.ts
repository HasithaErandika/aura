import { env } from "../../config/env.js";
import { verifyHs256 } from "../../lib/auth/jwt.js";
import { isRole } from "../../lib/auth/roles.js";
import type { AuthedUser } from "../../lib/auth/user.js";
import { sha256 } from "../../lib/hash.js";
import { forbidden, unauthenticated } from "../../lib/http/errors.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { TtlCache } from "../../lib/ttl-cache.js";
import { profilesRepository } from "./profiles.repository.js";
import { isAccessToken, resolveToken } from "./tokens.service.js";

const SESSION_CACHE_MAX = 5_000;
const sessions = new TtlCache<AuthedUser>(env.sessionCacheTtlMs, SESSION_CACHE_MAX);

async function identify(token: string): Promise<{ userId: string; email?: string }> {
  if (isAccessToken(token)) {
    const userId = await resolveToken(token);
    if (!userId) throw unauthenticated("Invalid, expired, or revoked access token");
    return { userId };
  }
  if (env.supabaseJwtSecret) {
    const claims = verifyHs256(token, env.supabaseJwtSecret);
    if (!claims) throw unauthenticated("Invalid or expired session");
    return { userId: claims.sub, email: claims.email };
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw unauthenticated("Invalid or expired session");
  return { userId: data.user.id, email: data.user.email };
}

async function resolveUser(token: string): Promise<AuthedUser> {
  const { userId, email } = await identify(token);
  const profile = await profilesRepository.find(userId).catch(() => null);
  if (!profile || !isRole(profile.role)) throw forbidden("No profile exists for this account");
  return { id: userId, email: email ?? profile.email, fullName: profile.full_name, role: profile.role, via: isAccessToken(token) ? "token" : "session" };
}

export async function authenticate(token: string): Promise<AuthedUser> {
  const key = sha256(token);
  const cached = sessions.get(key);
  if (cached) return cached;
  const user = await resolveUser(token);
  sessions.set(key, user);
  return user;
}

export function invalidateSessionsFor(userId: string): void {
  sessions.deleteWhere((user) => user.id === userId);
}
