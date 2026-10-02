import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { bridgeHub } from "./hub.js";
import { bridgeTickets } from "./tickets.js";

// The VS Code extension's side of the bridge (ADR-4). Developers only: the extension is the
// developer's client; every other role works in the web app.

export const bridgeRouter = Router();

// POST /bridge/tickets: a 60-second, single-use ticket to open the bridge WebSocket
// (wss://<api>/bridge?ticket=...).
bridgeRouter.post(
  "/tickets",
  requireRole("developer"),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const issued = bridgeTickets.issue(user.id);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "bridge.ticket.issued", entityType: "bridge", entityId: user.id, requestId: req.requestId, metadata: { via: user.via } });
    res.status(201).json({ ...issued, path: "/bridge" });
  }),
);

// GET /bridge/status: whether this developer's VS Code is connected.
bridgeRouter.get(
  "/status",
  requireRole("developer"),
  asyncHandler(async (req, res) => {
    res.json(bridgeHub.status(currentUser(req).id));
  }),
);
