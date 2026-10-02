import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { byIp, rateLimit } from "./lib/http/rate-limit.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { apiRouter, internalRouter } from "./routes/index.js";

const INTERNAL_BODY_LIMIT = "8mb";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.trustProxyHops);
  app.use(helmet());
  app.use(
    cors({
      origin: env.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
      maxAge: 600,
    }),
  );
  app.use(requestId);
  app.use("/internal", express.json({ limit: INTERNAL_BODY_LIMIT, type: "application/json" }), internalRouter);
  app.use(rateLimit({ name: "per client", windowMs: env.rateLimit.windowMs, max: env.rateLimit.perIp, key: byIp }));
  app.use(express.json({ limit: env.jsonBodyLimit, type: "application/json" }));
  app.use(apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
