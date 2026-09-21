import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { idParam } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewQaWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const testRunsRouter = Router();

// GET /test-runs/:epicKey?taskKey=... - Gate 7's real test-run history: the machine result
// (passed/failed/skipped) and the Tester Agent's interpretation, kept as separate fields.
testRunsRouter.get(
  "/:epicKey",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewQaWorkspace(user.role)) throw forbidden("Your role cannot view test-run history");
    const epicKey = idParam(req.params.epicKey, "Epic");
    const taskKey = typeof req.query.taskKey === "string" ? req.query.taskKey.trim().toUpperCase() : undefined;
    const { runs } = await runtimeClient.listTestRuns(epicKey, taskKey);
    res.json({ epicKey, runs });
  }),
);
