import { Router } from "express";
import { healthRouter } from "../modules/health/health.router.js";
import { meRouter } from "../modules/identity/me.router.js";
import { usersRouter } from "../modules/identity/users.router.js";
import { agentsRouter } from "../modules/agents/agents.router.js";
import { threadsRouter } from "../modules/threads/threads.router.js";
import { runsRouter } from "../modules/runs/runs.router.js";
import { approvalsRouter } from "../modules/approvals/approvals.router.js";
import { auditRouter } from "../modules/audit/audit.router.js";
import { dashboardRouter } from "../modules/dashboard/dashboard.router.js";
import { workspaceRouter } from "../modules/workspace/workspace.router.js";
import { jiraRouter } from "../modules/jira/jira.router.js";
import { requireAuth } from "../middleware/auth.js";
import { perUserLimit } from "../middleware/limits.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
// Everything below is authenticated, then rate limited per user.
apiRouter.use(requireAuth, perUserLimit);
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/agents", agentsRouter);
apiRouter.use("/threads", threadsRouter);
apiRouter.use("/runs", runsRouter);
apiRouter.use("/approvals", approvalsRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/workspace", workspaceRouter);
apiRouter.use("/jira", jiraRouter);
