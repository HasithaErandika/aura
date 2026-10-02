import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { uuidParam } from "../../lib/http/validate.js";
import { requireRun, takeRunNotes } from "./runs.service.js";

export const runsInternalRouter = Router();

runsInternalRouter.get(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const run = await requireRun(uuidParam(req.params.id, "Run"));
    res.json({ notes: await takeRunNotes(run.id) });
  }),
);
