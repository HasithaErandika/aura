import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Role } from "../lib/roles.js";

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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: "invalid or expired session" });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: "no profile found for this user" });
  }

  req.user = {
    id: userData.user.id,
    email: userData.user.email ?? "",
    fullName: profile.full_name,
    role: profile.role as Role,
  };
  next();
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "insufficient role", required: allowed });
    }
    next();
  };
}
