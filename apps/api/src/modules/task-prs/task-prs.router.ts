import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { requireAccess } from "../../lib/auth/user.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { canViewTaskPrs } from "../policy/index.js";
import { listQuerySchema } from "./task-prs.schemas.js";
import { listTaskPrs } from "./task-prs.service.js";

export const taskPrsRouter = Router();

taskPrsRouter.use(requireAccess(canViewTaskPrs, "You cannot view Task pull requests"));

taskPrsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ taskPrs: await listTaskPrs(parseOrThrow(listQuerySchema, req.query)) });
  }),
);
