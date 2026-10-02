import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../lib/http/async-handler.js";
import { bearerToken } from "../lib/http/bearer.js";
import { unauthenticated } from "../lib/http/errors.js";
import { authenticate } from "../modules/identity/index.js";

const MAX_TOKEN_LENGTH = 4096;

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerToken(req.header("authorization"));
  if (!token || token.length > MAX_TOKEN_LENGTH) throw unauthenticated("Missing bearer token");
  req.user = await authenticate(token);
  next();
});
