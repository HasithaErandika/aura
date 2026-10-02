import { Router } from "express";
import { ROLE_LABELS } from "../../lib/auth/roles.js";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { agentGrants, agentsApprovedByRole } from "../policy/index.js";
import { createTokenSchema } from "./identity.schemas.js";
import { invalidateSessionsFor } from "./session.service.js";
import { createToken, listTokens, revokeToken } from "./tokens.service.js";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const user = currentUser(req);
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    grants: { agents: agentGrants(user.role), approves: agentsApprovedByRole(user.role) },
  });
});

meRouter.get(
  "/tokens",
  asyncHandler(async (req, res) => {
    res.json({ tokens: await listTokens(currentUser(req).id) });
  }),
);

// Session only: a leaked token must not be able to mint another token.
meRouter.post(
  "/tokens",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.via !== "session") throw forbidden("Access tokens can only be created from a signed-in browser session");
    const { name, expiresInDays } = parseOrThrow(createTokenSchema, req.body);
    const { token, view } = await createToken(user.id, name, expiresInDays);
    await writeAudit({ ...auditActor(req), action: "access_token.created", entityType: "access_token", entityId: view.id, metadata: { name, expiresAt: view.expiresAt } });
    res.status(201).json({ token, accessToken: view });
  }),
);

meRouter.delete(
  "/tokens/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const tokenId = uuidParam(req.params.id, "Access token");
    if (!(await revokeToken(user.id, tokenId))) throw notFound("Access token");
    invalidateSessionsFor(user.id);
    await writeAudit({ ...auditActor(req), action: "access_token.revoked", entityType: "access_token", entityId: tokenId });
    res.status(204).end();
  }),
);
