import { Router } from "express";
import { ROLE_LABELS } from "../../lib/auth/roles.js";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { createUserSchema, updateRoleSchema } from "./identity.schemas.js";
import { changeRole, createUser, listUsers, removeUser } from "./users.service.js";

export const usersRouter = Router();
usersRouter.use(requireRole("admin"));

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ users: await listUsers() });
  }),
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(createUserSchema, req.body);
    const { id, temporaryPassword } = await createUser(input);
    await writeAudit({ ...auditActor(req), action: "user.created", entityType: "user", entityId: id, metadata: { email: input.email, role: input.role } });
    res.status(201).json({ id, email: input.email, fullName: input.fullName, role: input.role, temporaryPassword });
  }),
);

usersRouter.patch(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const targetId = uuidParam(req.params.id, "User");
    const { role } = parseOrThrow(updateRoleSchema, req.body);
    const { from } = await changeRole(currentUser(req).id, targetId, role);
    await writeAudit({ ...auditActor(req), action: "user.role_changed", entityType: "user", entityId: targetId, metadata: { from, to: role } });
    res.json({ id: targetId, role, roleLabel: ROLE_LABELS[role] });
  }),
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const targetId = uuidParam(req.params.id, "User");
    await removeUser(currentUser(req).id, targetId);
    await writeAudit({ ...auditActor(req), action: "user.deprovisioned", entityType: "user", entityId: targetId });
    res.status(204).send();
  }),
);
