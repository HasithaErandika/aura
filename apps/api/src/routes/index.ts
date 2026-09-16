import { Router } from "express";
import { healthRouter } from "./health.route.js";
import { runsRouter } from "./runs.route.js";
import { approvalsRouter } from "./approvals.route.js";
import { meRouter } from "./me.route.js";
import { usersRouter } from "./users.route.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/runs", runsRouter);
apiRouter.use("/approvals", approvalsRouter);
