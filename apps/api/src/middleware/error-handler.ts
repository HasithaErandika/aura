import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http/errors.js";
import { errorMessage, logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      logger.error("request failed", { requestId: req.requestId, code: error.code, message: error.message });
    } else if (error.status === 401 || error.status === 403 || error.status === 429) {
      logger.warn("request denied", { requestId: req.requestId, code: error.code, ip: req.ip, path: req.path });
    }
    const details = error.status >= 500 && env.isProduction ? undefined : error.details;
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details, requestId: req.requestId },
    });
    return;
  }

  // Body-parser JSON syntax errors carry a status.
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  const message = status === 500 && env.isProduction ? "Internal server error" : errorMessage(error);
  if (status >= 500) {
    logger.error("unhandled error", { requestId: req.requestId, message: errorMessage(error) });
  } else {
    logger.warn("request rejected", { requestId: req.requestId, status, message: errorMessage(error) });
  }
  res.status(status).json({ error: { code: status === 500 ? "internal" : "bad_request", message, requestId: req.requestId } });
}
