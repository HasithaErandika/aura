import { Router } from "express";
import { currentUser } from "../../middleware/auth.js";
import { ROLE_LABELS } from "./roles.js";
import { ROLE_AGENT_GRANTS, agentsApprovedByRole } from "../policy/policy.js";

export const meRouter = Router();

// The caller's identity plus the grants the policy module gives their role, so the web can
// build navigation from data instead of duplicating the tables.
meRouter.get("/", (req, res) => {
  const user = currentUser(req);
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    grants: {
      agents: ROLE_AGENT_GRANTS[user.role],
      approves: agentsApprovedByRole(user.role),
    },
  });
});
