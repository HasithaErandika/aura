import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, gone, notFound } from "../../lib/http/errors.js";
import { byIp, rateLimit } from "../../lib/http/rate-limit.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { webUrl } from "../../lib/web-url.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { deviceAuth } from "./device.store.js";
import { deviceCodeSchema, deviceStartSchema, deviceTokenSchema } from "./identity.schemas.js";
import { createToken } from "./tokens.service.js";

const TOKEN_LIFETIME_DAYS = 90;

export const devicePublicRouter = Router();
devicePublicRouter.use(rateLimit({ name: "device sign-in", windowMs: 60_000, max: 60, key: byIp }));

devicePublicRouter.post("/start", (req, res) => {
  const { clientName } = parseOrThrow(deviceStartSchema, req.body ?? {});
  const grant = deviceAuth.start(clientName);
  res.status(201).json({
    ...grant,
    verificationUri: webUrl("/app/device"),
    verificationUriComplete: webUrl(`/app/device?code=${encodeURIComponent(grant.userCode)}`),
  });
});

// RFC 8628: 200 with the token once approved, otherwise 400 with the pending status.
devicePublicRouter.post("/token", (req, res) => {
  const { deviceCode } = parseOrThrow(deviceTokenSchema, req.body);
  const result = deviceAuth.poll(deviceCode);
  if (result.status === "approved") res.json({ token: result.token });
  else res.status(400).json({ error: result.status });
});

export const deviceRouter = Router();
deviceRouter.use(requireRole("developer"));

deviceRouter.get("/:userCode", (req, res) => {
  const grant = deviceAuth.lookup(String(req.params.userCode));
  if (!grant) throw notFound("Sign-in code");
  res.json(grant);
});

deviceRouter.post(
  "/approve",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (user.via !== "session") throw forbidden("Approve the sign-in from a signed-in browser session");
    const { userCode } = parseOrThrow(deviceCodeSchema, req.body);
    let minted: { id: string; name: string } | null = null;
    const approved = await deviceAuth.approve(userCode, user.id, async (clientName) => {
      const { token, view } = await createToken(user.id, clientName, TOKEN_LIFETIME_DAYS);
      minted = { id: view.id, name: clientName };
      return token;
    });
    if (!approved || !minted) throw gone("This sign-in code has expired or was already used. Start again in VS Code.");
    const { id, name } = minted as { id: string; name: string };
    await writeAudit({ ...auditActor(req), action: "access_token.created", entityType: "access_token", entityId: id, metadata: { name, via: "device" } });
    res.json({ approved: true });
  }),
);

deviceRouter.post("/deny", (req, res) => {
  const { userCode } = parseOrThrow(deviceCodeSchema, req.body);
  if (!deviceAuth.deny(userCode)) throw notFound("Sign-in code");
  res.json({ denied: true });
});
