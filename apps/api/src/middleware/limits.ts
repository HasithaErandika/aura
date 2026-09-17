import { env } from "../config/env.js";
import { byUser, rateLimit } from "../lib/http/rate-limit.js";

// Per-user limits. Defined here (not in routes/index.ts) so routers can import them without
// a circular import.
export const perUserLimit = rateLimit({ name: "per user", windowMs: env.rateLimit.windowMs, max: env.rateLimit.perUser, key: byUser });

// Agent turns cost model tokens; keep them well below the general limit.
export const agentTurnLimit = rateLimit({
  name: "agent turns",
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.agentTurnsPerUser,
  key: byUser,
});
