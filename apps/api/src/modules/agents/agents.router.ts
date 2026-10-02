import { Router } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { idParam } from "../../lib/http/validate.js";
import { getAgentFor, listAgentsFor } from "./agents.service.js";

export const agentsRouter = Router();

agentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ agents: await listAgentsFor(currentUser(req).role) });
  }),
);

agentsRouter.get(
  "/:agentId",
  asyncHandler(async (req, res) => {
    res.json({ agent: await getAgentFor(currentUser(req).role, idParam(req.params.agentId, "Agent")) });
  }),
);
