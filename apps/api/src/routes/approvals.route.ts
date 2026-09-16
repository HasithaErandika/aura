import { Router } from "express";
import { z } from "zod";

export const approvalsRouter = Router();

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

// POST /approvals/:id/decide — records a human decision and resumes the
// suspended workflow. See docs/ARCHITECTURE.md §5.3 (run state machine).
approvalsRouter.post("/:id/decide", (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  res.status(501).json({ error: "not implemented", approvalId: req.params.id, body: parsed.data });
});
