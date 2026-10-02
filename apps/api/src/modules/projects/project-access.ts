import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { assertProjectAccess } from "./projects.service.js";

// Guards a project's routes: members of the current project and admins only (step 4.1).
export function requireProjectMember(req: Request, _res: Response, next: NextFunction): void {
  let user;
  try {
    user = currentUser(req);
  } catch (error) {
    return next(error);
  }
  assertProjectAccess(user).then(() => next(), next);
}
