import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewDevWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const dockerRouter = Router();

// GET /docker/runs - Lists Gate 4/5/7 Docker containers that are running or recently ran; observational only.
dockerRouter.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view Docker run activity");
    const epicKey = typeof req.query.epic === "string" ? req.query.epic : undefined;
    const { runs } = await runtimeClient.listDockerRuns(epicKey);
    res.json({ runs });
  }),
);
