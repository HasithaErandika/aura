import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { badRequest, notFound, unauthenticated } from "../../lib/http/errors.js";
import { CREDENTIAL_PROVIDERS, credentialsRepository, type CredentialProvider } from "./credentials.repository.js";

// Server-to-server only: apps/agent-runtime's delegate_to_code (Gate 5) fetches a user's
// decrypted coding-agent credential just-in-time, right before running the sandboxed CLI, and
// never persists it. Mounted BEFORE requireAuth in routes/index.ts (like /health) - this is
// not reachable with a user's own Supabase session token, only with RUNTIME_INTERNAL_TOKEN.
// apps/agent-runtime has no Supabase access of its own; this narrow route is the one bridge,
// kept deliberately smaller than giving the runtime its own service-role client + encryption
// key (docs/ARCHITECTURE.md §6.5).
export const internalCredentialsRouter = Router();

internalCredentialsRouter.use((req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token || token !== env.runtimeInternalToken) return next(unauthenticated("Invalid internal token"));
  next();
});

function providerParam(raw: string | undefined): CredentialProvider {
  if (!raw || !CREDENTIAL_PROVIDERS.includes(raw as CredentialProvider)) throw badRequest(`provider must be one of ${CREDENTIAL_PROVIDERS.join(", ")}`);
  return raw as CredentialProvider;
}

internalCredentialsRouter.get(
  "/:userId/:provider",
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const provider = providerParam(req.params.provider);
    const apiKey = await credentialsRepository.getDecrypted(userId, provider);
    if (!apiKey) throw notFound("Credential");
    res.json({ apiKey });
  }),
);
