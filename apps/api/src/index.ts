import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { errorMessage, logger } from "./lib/logger.js";
import { startTurnQueue, stopTurnQueue } from "./modules/orchestration/turn-jobs.js";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info("aura-api listening", { port: env.port, env: env.nodeEnv, runtimeUrl: env.runtimeUrl });
});

// Agent turns run as background jobs (pg-boss with DATABASE_URL, in-process otherwise).
startTurnQueue().catch((error) => {
  logger.error("turn queue failed to start", { message: errorMessage(error) });
  process.exit(1);
});

// SSE responses can stay open for the length of an agent turn.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  server.close(() => {
    void stopTurnQueue().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
