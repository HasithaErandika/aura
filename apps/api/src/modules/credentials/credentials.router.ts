import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { badRequest } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { CREDENTIAL_PROVIDERS, credentialsRepository, type CredentialProvider } from "./credentials.repository.js";

export const credentialsRouter = Router();

// Only developer needs this - it exists solely to feed Gate 5's Coding Agent
// (delegate_to_code), which only developer can run (policy.ts ROLE_AGENT_GRANTS).
credentialsRouter.use(requireRole("developer"));

function providerParam(raw: string | undefined): CredentialProvider {
  if (!raw || !CREDENTIAL_PROVIDERS.includes(raw as CredentialProvider)) throw badRequest(`provider must be one of ${CREDENTIAL_PROVIDERS.join(", ")}`);
  return raw as CredentialProvider;
}

// GET /credentials - the caller's own connected providers, masked.
credentialsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const credentials = await credentialsRepository.listForUser(user.id);
    res.json({ credentials });
  }),
);

const setBodySchema = z.object({ apiKey: z.string().trim().min(1).max(2000) }).strict();

// PUT /credentials/:provider - connects or replaces the caller's own key for that provider.
// The key itself is never logged or echoed back.
credentialsRouter.put(
  "/:provider",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const provider = providerParam(req.params.provider);
    const { apiKey } = parseOrThrow(setBodySchema, req.body);
    await credentialsRepository.upsert(user.id, provider, apiKey);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "credentials.set", entityType: "coding_agent_credential", entityId: provider });
    const credentials = await credentialsRepository.listForUser(user.id);
    res.json({ credentials });
  }),
);

// DELETE /credentials/:provider - disconnects the caller's own key.
credentialsRouter.delete(
  "/:provider",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const provider = providerParam(req.params.provider);
    await credentialsRepository.remove(user.id, provider);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "credentials.remove", entityType: "coding_agent_credential", entityId: provider });
    const credentials = await credentialsRepository.listForUser(user.id);
    res.json({ credentials });
  }),
);
