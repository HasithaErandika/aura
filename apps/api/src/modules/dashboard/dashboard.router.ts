import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { runtimeClient } from "../runtime/index.js";
import { qualityQuerySchema, tokenUsageQuerySchema } from "./dashboard.schemas.js";
import { dashboardSummary } from "./dashboard.service.js";
import { agentQuality } from "./quality.service.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    res.json(await dashboardSummary(currentUser(req)));
  }),
);

dashboardRouter.get(
  "/token-usage",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { days } = parseOrThrow(tokenUsageQuerySchema, req.query);
    res.json(await runtimeClient.tokenUsage(days));
  }),
);

dashboardRouter.get(
  "/agent-quality",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { days } = parseOrThrow(qualityQuerySchema, req.query);
    res.json(await agentQuality(days));
  }),
);
