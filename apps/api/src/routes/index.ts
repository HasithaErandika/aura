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
import { jiraRouter } from "../modules/jira/jira.router.js";
import { projectsRouter } from "../modules/projects/projects.router.js";
import { designDocsRouter } from "../modules/design-docs/design-docs.router.js";
import { settingsRouter } from "../modules/settings/settings.router.js";
import { bridgeRouter } from "../modules/bridge/bridge.router.js";
import { devicePublicRouter, deviceRouter } from "../modules/identity/device.router.js";
import { ciPublicRouter, notificationsRouter, taskPrsRouter } from "../modules/task-prs/task-prs.router.js";
import { requireAuth } from "../middleware/auth.js";
import { perUserLimit } from "../middleware/limits.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
// VS Code device sign-in: the extension's two calls happen before it has a token.
apiRouter.use("/auth/device", devicePublicRouter);
// CI reports from a project's aura-ci.yml, proven by GitHub Actions OIDC (modules/task-prs).
apiRouter.use("/ci", ciPublicRouter);
// Everything below is authenticated, then rate limited per user.
apiRouter.use(requireAuth, perUserLimit);
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/projects", projectsRouter);
apiRouter.use("/design-docs", designDocsRouter);
apiRouter.use("/task-prs", taskPrsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/bridge", bridgeRouter);
apiRouter.use("/device", deviceRouter);
apiRouter.use("/agents", agentsRouter);
apiRouter.use("/threads", threadsRouter);
apiRouter.use("/runs", runsRouter);
apiRouter.use("/approvals", approvalsRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/jira", jiraRouter);
