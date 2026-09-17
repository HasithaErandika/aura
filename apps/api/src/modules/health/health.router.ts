import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { runtimeClient } from "../runtime/runtime.client.js";
import { env } from "../../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "aura-api", env: env.nodeEnv });
});

// Liveness of the agent runtime as seen from the API. The web shows this in the header.
healthRouter.get(
  "/runtime",
  asyncHandler(async (_req, res) => {
    const health = await runtimeClient.health();
    res.status(health.ok ? 200 : 503).json({ runtime: { url: env.runtimeUrl, ...health } });
  }),
);
