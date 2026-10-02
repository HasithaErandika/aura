import { env } from "../config/env.js";
import { byUser, rateLimit } from "../lib/http/rate-limit.js";

export const perUserLimit = rateLimit({ name: "per user", windowMs: env.rateLimit.windowMs, max: env.rateLimit.perUser, key: byUser });

export const agentTurnLimit = rateLimit({ name: "agent turns", windowMs: env.rateLimit.windowMs, max: env.rateLimit.agentTurnsPerUser, key: byUser });
