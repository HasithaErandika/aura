import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info("aura-api listening", { port: env.port, env: env.nodeEnv, runtimeUrl: env.runtimeUrl });
});

// SSE responses can stay open for the length of an agent turn.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
