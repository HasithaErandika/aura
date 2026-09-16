import { Router } from "express";
import { z } from "zod";

export const runsRouter = Router();

const createRunSchema = z.object({
  agentId: z.string(),
  issueKey: z.string(),
});

// POST /runs — authorize via the Policy Engine, then enqueue run.requested.
// See docs/ARCHITECTURE.md §4.3 for the full authorization flow.
runsRouter.post("/", (req, res) => {
  const parsed = createRunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  res.status(501).json({ error: "not implemented", body: parsed.data });
});
