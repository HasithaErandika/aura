import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { safeEqual } from "../lib/hash.js";
import { bearerToken } from "../lib/http/bearer.js";
import { forbidden, unauthenticated } from "../lib/http/errors.js";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function requireRuntime(req: Request, _res: Response, next: NextFunction) {
  if (!env.runtimeToken) {
    return next(LOOPBACK.has(req.socket.remoteAddress ?? "") ? undefined : forbidden("Runtime calls are accepted only on loopback without MASTRA_RUNTIME_TOKEN"));
  }
  next(safeEqual(bearerToken(req.header("authorization")) ?? "", env.runtimeToken) ? undefined : unauthenticated("Invalid runtime token"));
}
