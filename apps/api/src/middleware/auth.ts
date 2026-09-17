import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { sha256 } from "../lib/hash.js";
import { verifyHs256 } from "../lib/auth/jwt.js";
import { forbidden, unauthenticated } from "../lib/http/errors.js";
import { asyncHandler } from "../lib/http/async-handler.js";
import { isRole, type Role } from "../modules/identity/roles.js";

export interface AuthedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// Short-lived cache of verified sessions keyed by a hash of the token, never the token
// itself. The UI polls several endpoints; without this every request would cost a Supabase
// round trip. A role change or removal invalidates the entry immediately.
const SESSION_CACHE_MAX = 5_000;
const sessionCache = new Map<string, { user: AuthedUser; expiresAt: number }>();

function cacheGet(key: string): AuthedUser | null {
  const hit = sessionCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    sessionCache.delete(key);
    return null;
  }
  return hit.user;
}

function cacheSet(key: string, user: AuthedUser) {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value;
    if (oldest) sessionCache.delete(oldest);
  }
  sessionCache.set(key, { user, expiresAt: Date.now() + env.sessionCacheTtlMs });
}

export function invalidateSessionsFor(userId: string) {
  for (const [key, entry] of sessionCache) {
    if (entry.user.id === userId) sessionCache.delete(key);
  }
}

async function loadProfile(userId: string): Promise<{ fullName: string | null; role: Role; email: string } | null> {
  const { data, error } = await supabaseAdmin.from("profiles").select("full_name, role, email").eq("id", userId).single();
  if (error || !data || !isRole(data.role)) return null;
  return { fullName: data.full_name, role: data.role, email: data.email };
}

async function resolveUser(token: string): Promise<AuthedUser> {
  let userId: string;
  let email: string | undefined;

  if (env.supabaseJwtSecret) {
    const claims = verifyHs256(token, env.supabaseJwtSecret);
    if (!claims) throw unauthenticated("Invalid or expired session");
    userId = claims.sub;
    email = claims.email;
  } else {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw unauthenticated("Invalid or expired session");
    userId = data.user.id;
    email = data.user.email;
  }

  // The profile row is the source of the role and disappears when an account is removed,
  // so a still-valid token for a deprovisioned user is rejected here.
  const profile = await loadProfile(userId);
  if (!profile) throw forbidden("No profile exists for this account");

  return { id: userId, email: email ?? profile.email, fullName: profile.fullName, role: profile.role };
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token || token.length > 4096) throw unauthenticated("Missing bearer token");

  const key = sha256(token);
  const cached = cacheGet(key);
  if (cached) {
    req.user = cached;
    return next();
  }
  const user = await resolveUser(token);
  cacheSet(key, user);
  req.user = user;
  next();
});

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!allowed.includes(req.user.role)) {
      return next(forbidden("Your role cannot access this resource", { required: allowed }));
    }
    next();
  };
}

export function currentUser(req: Request): AuthedUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
