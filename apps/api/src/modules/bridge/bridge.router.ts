import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { bridgeHub } from "./bridge.hub.js";
import { bridgeTickets } from "./bridge.tickets.js";

export const bridgeRouter = Router();
bridgeRouter.use(requireRole("developer"));

bridgeRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const issued = bridgeTickets.issue(user.id);
    await writeAudit({ ...auditActor(req), action: "bridge.ticket.issued", entityType: "bridge", entityId: user.id, metadata: { via: user.via } });
    res.status(201).json({ ...issued, path: "/bridge" });
  }),
);

bridgeRouter.get("/status", (req, res) => {
  res.json(bridgeHub.status(currentUser(req).id));
});
