import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { currentUser, invalidateSessionsFor } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { ROLE_LABELS } from "./roles.js";
import { ROLE_AGENT_GRANTS, agentsApprovedByRole } from "../policy/policy.js";
import { createToken, listTokens, revokeToken } from "./tokens.service.js";

export const meRouter = Router();

export interface GitIdentity {
  name: string | null;
  email: string | null;
}

export async function gitIdentityFor(userId: string): Promise<GitIdentity> {
  const { data, error } = await supabaseAdmin.from("profiles").select("git_name, git_email").eq("id", userId).single();
  if (error || !data) return { name: null, email: null };
  return { name: data.git_name ?? null, email: data.git_email ?? null };
}

// The caller's identity plus the grants the policy module gives their role, so the web can
// build navigation from data instead of duplicating the tables.
meRouter.get(
  "/",
  asyncHandler(async (req, res) => {
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
      gitIdentity: await gitIdentityFor(user.id),
    });
  }),
);

const gitIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
  })
  .strict();

// PUT /me/git-identity - the name/email AURA uses when it commits on this user's behalf
// server-side. The CLI fills it from the developer's own `git config` at `aura login`.
meRouter.put(
  "/git-identity",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { name, email } = parseOrThrow(gitIdentitySchema, req.body);
    const { error } = await supabaseAdmin.from("profiles").update({ git_name: name, git_email: email }).eq("id", user.id);
    if (error) throw new Error(`could not save git identity: ${error.message}`);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "profile.git_identity.update", entityType: "profile", entityId: user.id, requestId: req.requestId, metadata: { name, email } });
    res.json({ gitIdentity: { name, email } });
  }),
);

// Personal access tokens for the CLI / VS Code extension (tokens.service.ts).
meRouter.get(
  "/tokens",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ tokens: await listTokens(user.id) });
  }),
);

const createTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    expiresInDays: z.number().int().min(1).max(365).default(90),
  })
  .strict();

// POST /me/tokens - returns the raw token exactly once. Browser sessions only: a token cannot
// mint another token, so a leaked one cannot outlive its own expiry or revocation.
meRouter.post(
  "/tokens",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.via !== "session") throw forbidden("Access tokens can only be created from a signed-in browser session");
    const { name, expiresInDays } = parseOrThrow(createTokenSchema, req.body);
    const { token, view } = await createToken(user.id, name, expiresInDays * 86_400_000);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "access_token.created", entityType: "access_token", entityId: view.id, requestId: req.requestId, metadata: { name, expiresAt: view.expiresAt } });
    res.status(201).json({ token, accessToken: view });
  }),
);

meRouter.delete(
  "/tokens/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const tokenId = uuidParam(req.params.id, "Access token");
    if (!(await revokeToken(user.id, tokenId))) throw notFound("Access token");
    // Drops every cached session for this user so the revoked token stops working immediately
    // instead of after the session cache TTL.
    invalidateSessionsFor(user.id);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "access_token.revoked", entityType: "access_token", entityId: tokenId, requestId: req.requestId });
    res.status(204).end();
  }),
);
