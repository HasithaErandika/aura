import { Router } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { markReadSchema } from "./notifications.schemas.js";
import { listNotifications, markRead } from "./notifications.service.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listNotifications(currentUser(req).id));
  }),
);

notificationsRouter.post(
  "/read",
  asyncHandler(async (req, res) => {
    const { ids } = parseOrThrow(markReadSchema, req.body ?? {});
    await markRead(currentUser(req).id, ids);
    res.json({ ok: true });
  }),
);
