import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthenticated } from "../http/errors.js";
import type { Role } from "./roles.js";

export interface AuthedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  via: "session" | "token";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function currentUser(req: Request): AuthedUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!allowed.includes(req.user.role)) return next(forbidden("Your role cannot access this resource", { required: allowed }));
    next();
  };
}

export function requireAccess(allowed: (role: Role) => boolean, message: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    next(allowed(req.user.role) ? undefined : forbidden(message));
  };
}
