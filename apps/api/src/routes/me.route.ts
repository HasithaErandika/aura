import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ROLE_LABELS } from "../lib/roles.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, (req, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
  });
});
