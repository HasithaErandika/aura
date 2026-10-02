import { Router } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { agentTurnLimit } from "../../middleware/limits.js";
import { resumeAfterDecision } from "../orchestration/index.js";
import { decideSchema, listQuerySchema } from "./approvals.schemas.js";
import { decide, expireOverdue, getApprovalForViewer, listInbox, toApprovalViews } from "./approvals.service.js";

export const approvalsRouter = Router();

approvalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { status, limit } = parseOrThrow(listQuerySchema, req.query);
    await expireOverdue();
    res.json({ approvals: await toApprovalViews(await listInbox(user, status, limit), user) });
  }),
);

approvalsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Approval request");
    await expireOverdue();
    res.json(await getApprovalForViewer(id, currentUser(req)));
  }),
);

// The decision is committed before the resume is queued, so a dropped stream never loses it.
approvalsRouter.post(
  "/:id/decide",
  agentTurnLimit,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const approvalId = uuidParam(req.params.id, "Approval request");
    const body = parseOrThrow(decideSchema, req.body);
    const { approval, resumeData } = await decide({
      approvalId,
      user,
      decision: body.decision,
      answer: body.answer ?? null,
      reason: body.reason ?? null,
      snapshotHash: body.snapshotHash ?? null,
      requestId: req.requestId,
    });
    await resumeAfterDecision(req, res, { approval, decision: body.decision, resumeData, user });
  }),
);
