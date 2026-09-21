import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewDevWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const dockerRouter = Router();

// GET /docker/runs - which Gate 4/5/7 Docker containers are currently running or recently ran.
// Purely observational (docs/ARCHITECTURE.md section 6.4/6.5) - never used to decide anything,
// same audience as the dev workspace viewer.
dockerRouter.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view Docker run activity");
    const { runs } = await runtimeClient.listDockerRuns();
    res.json({ runs });
  }),
);
