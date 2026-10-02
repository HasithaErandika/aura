import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { HttpError, forbidden, notFound } from "../../lib/http/errors.js";
import { byIp, rateLimit } from "../../lib/http/rate-limit.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { deviceAuth } from "./device-auth.js";
import { createToken } from "./tokens.service.js";

// Device sign-in for the VS Code extension (device-auth.ts). Two routers: the extension's two
// calls need no session yet; the approval needs a signed-in developer in the browser.

const TOKEN_LIFETIME_MS = 90 * 86_400_000;

// Strict per-address limit on the unauthenticated half.
const deviceLimit = rateLimit({ name: "device sign-in", windowMs: 60_000, max: 60, key: byIp });

export const devicePublicRouter = Router();
devicePublicRouter.use(deviceLimit);

// POST /auth/device/start → codes and where to approve them.
devicePublicRouter.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { clientName } = parseOrThrow(z.object({ clientName: z.string().trim().min(1).max(80).default("VS Code") }).strict(), req.body ?? {});
    const grant = deviceAuth.start(clientName);
    const web = env.webOrigin[0] ?? "http://localhost:5173";
    res.status(201).json({
      ...grant,
      verificationUri: `${web}/app/device`,
      verificationUriComplete: `${web}/app/device?code=${encodeURIComponent(grant.userCode)}`,
    });
  }),
);

// POST /auth/device/token → 200 { token } once approved; 400 { error } otherwise (RFC 8628 names).
devicePublicRouter.post(
  "/token",
  asyncHandler(async (req, res) => {
    const { deviceCode } = parseOrThrow(z.object({ deviceCode: z.string().min(20).max(100) }).strict(), req.body);
    const result = deviceAuth.poll(deviceCode);
    if (result.status === "approved") {
      res.json({ token: result.token });
      return;
    }
    res.status(400).json({ error: result.status });
  }),
);

export const deviceRouter = Router();

const codeSchema = z.object({ userCode: z.string().trim().min(4).max(20) }).strict();

// GET /device/:userCode → what the approval page shows.
deviceRouter.get(
  "/:userCode",
  requireRole("developer"),
  asyncHandler(async (req, res) => {
    const grant = deviceAuth.lookup(String(req.params.userCode));
    if (!grant) throw notFound("Sign-in code");
    res.json(grant);
  }),
);

// POST /device/approve → mints a 90-day access token for this developer (shown on the Profile
// page, revocable there). Browser sessions only, like every other token.
deviceRouter.post(
  "/approve",
  requireRole("developer"),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.via !== "session") throw forbidden("Approve the sign-in from a signed-in browser session");
    const { userCode } = parseOrThrow(codeSchema, req.body);
    let tokenId: string | null = null;
    let tokenName = "";
    const approved = await deviceAuth.approve(userCode, user.id, async (clientName) => {
      tokenName = clientName;
      const { token, view } = await createToken(user.id, clientName, TOKEN_LIFETIME_MS);
      tokenId = view.id;
      return token;
    });
    if (!approved) throw new HttpError(410, "not_found", "This sign-in code has expired or was already used. Start again in VS Code.");
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "access_token.created", entityType: "access_token", entityId: tokenId ?? undefined, requestId: req.requestId, metadata: { name: tokenName, via: "device" } });
    res.json({ approved: true });
  }),
);

deviceRouter.post(
  "/deny",
  requireRole("developer"),
  asyncHandler(async (req, res) => {
    const { userCode } = parseOrThrow(codeSchema, req.body);
    if (!deviceAuth.deny(userCode)) throw notFound("Sign-in code");
    res.json({ denied: true });
  }),
);
