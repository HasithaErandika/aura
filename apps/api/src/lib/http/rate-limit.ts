import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors.js";

// Fixed-window counter per key, in memory. Enough for one API process in front of a
// single-tenant deployment; swap the store for Redis when the API is scaled horizontally.

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (req: Request) => string | null;
  name: string;
}

const MAX_BUCKETS = 50_000;

export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const sweep = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };
  const timer = setInterval(sweep, Math.max(options.windowMs, 10_000));
  timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.key(req);
    if (!key) return next();
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS) sweep();
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((bucket.resetAt - now) / 1000)));
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new HttpError(429, "rate_limited", `Too many requests (${options.name}). Try again shortly.`));
    }
    next();
  };
}

export const byIp = (req: Request) => req.ip ?? null;
export const byUser = (req: Request) => req.user?.id ?? req.ip ?? null;
