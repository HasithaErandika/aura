import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { callSchema } from "./bridge.schemas.js";
import { forwardCall } from "./bridge.service.js";

export const bridgeInternalRouter = Router();

bridgeInternalRouter.post(
  "/calls",
  asyncHandler(async (req, res) => {
    res.json(await forwardCall(parseOrThrow(callSchema, req.body), req.requestId));
  }),
);
