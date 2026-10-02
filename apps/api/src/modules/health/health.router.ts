import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { runtimeClient } from "../runtime/index.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "aura-api", env: env.nodeEnv });
});

healthRouter.get(
  "/runtime",
  asyncHandler(async (_req, res) => {
    const health = await runtimeClient.health();
    res.status(health.ok ? 200 : 503).json({ runtime: { url: env.runtimeUrl, ...health } });
  }),
);
