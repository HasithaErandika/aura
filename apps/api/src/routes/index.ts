import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { perUserLimit } from "../middleware/limits.js";
import { requireRuntime } from "../middleware/runtime-auth.js";
import { agentsRouter } from "../modules/agents/index.js";
import { approvalsRouter } from "../modules/approvals/index.js";
import { auditRouter } from "../modules/audit/index.js";
import { bridgeInternalRouter, bridgeRouter } from "../modules/bridge/index.js";
import { dashboardRouter } from "../modules/dashboard/index.js";
import { designDocsInternalRouter, designDocsRouter } from "../modules/design-docs/index.js";
import { healthRouter } from "../modules/health/index.js";
import { devicePublicRouter, deviceRouter, meRouter, usersRouter } from "../modules/identity/index.js";
import { jiraRouter } from "../modules/jira/index.js";
import { notificationsRouter } from "../modules/notifications/index.js";
import { projectsRouter, requireProjectMember } from "../modules/projects/index.js";
import { runsInternalRouter, runsRouter } from "../modules/runs/index.js";
import { settingsRouter } from "../modules/settings/index.js";
import { ciRouter, taskPrsInternalRouter, taskPrsRouter } from "../modules/task-prs/index.js";
import { threadsRouter } from "../modules/threads/index.js";
import { webhooksRouter } from "../modules/webhooks/index.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth/device", devicePublicRouter);
apiRouter.use("/ci", ciRouter);

apiRouter.use(requireAuth, perUserLimit);
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/projects", projectsRouter);
// A project's work: members of the current project and admins only (step 4.1).
apiRouter.use("/design-docs", requireProjectMember, designDocsRouter);
apiRouter.use("/task-prs", requireProjectMember, taskPrsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/bridge", requireProjectMember, bridgeRouter);
apiRouter.use("/device", deviceRouter);
apiRouter.use("/agents", requireProjectMember, agentsRouter);
apiRouter.use("/threads", requireProjectMember, threadsRouter);
apiRouter.use("/runs", requireProjectMember, runsRouter);
apiRouter.use("/approvals", requireProjectMember, approvalsRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/dashboard", requireProjectMember, dashboardRouter);
apiRouter.use("/jira", requireProjectMember, jiraRouter);

export const internalRouter = Router();

internalRouter.use(requireRuntime);
internalRouter.use("/bridge", bridgeInternalRouter);
internalRouter.use("/runs", runsInternalRouter);
internalRouter.use("/design-docs", designDocsInternalRouter);
internalRouter.use("/task-prs", taskPrsInternalRouter);

// Signed by GitHub or Jira, not by a user; app.ts mounts it with the raw body parser.
export { webhooksRouter };
