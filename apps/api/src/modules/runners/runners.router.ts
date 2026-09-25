import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { idParam } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewDevWorkspace } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const runnersRouter = Router();

// GET /runners?epic= - what AURA is running right now (Docker containers with live usage, host
// capacity, Coding Council runs, host checks, terminal sessions) for the Runners tab under
// Project Files. Observational only. Same audience as the code it runs against (the Docker runs
// list already uses this rule). Other people's terminal sessions are reduced to "someone else":
// who is working in which directory is not this viewer's business.
runnersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.role !== "admin" && !canViewDevWorkspace(user.role)) throw forbidden("Your role cannot view runner activity");
    const epicKey = typeof req.query.epic === "string" && req.query.epic ? idParam(req.query.epic, "Epic") : undefined;
    const snapshot = await runtimeClient.runners(epicKey);
    const terminals = snapshot.terminals.map(({ userId, label, ...session }) => ({ ...session, mine: userId === user.id, label: userId === user.id ? label : null }));
    res.json({ ...snapshot, terminals });
  }),
);
