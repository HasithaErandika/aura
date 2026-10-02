import { Router } from "express";
import { requireAccess } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { canViewJira } from "../policy/index.js";
import { jira, jiraConfigured } from "./jira.client.js";
import { commentBodySchema, searchQuerySchema, transitionBodySchema } from "./jira.schemas.js";

export const jiraRouter = Router();
jiraRouter.use(requireAccess(canViewJira, "Your role cannot browse Jira"));

jiraRouter.get("/status", (_req, res) => {
  res.json({ configured: jiraConfigured });
});

jiraRouter.get(
  "/epics",
  asyncHandler(async (req, res) => {
    const { q } = parseOrThrow(searchQuerySchema, req.query);
    res.json({ epics: await jira.listEpics(q) });
  }),
);

jiraRouter.get(
  "/epics/:epicKey",
  asyncHandler(async (req, res) => {
    res.json(await jira.getEpic(idParam(req.params.epicKey, "Epic")));
  }),
);

jiraRouter.get(
  "/issues/:key",
  asyncHandler(async (req, res) => {
    res.json({ issue: await jira.getIssue(idParam(req.params.key, "Issue")) });
  }),
);

jiraRouter.get(
  "/issues/:key/transitions",
  asyncHandler(async (req, res) => {
    res.json({ transitions: await jira.getTransitions(idParam(req.params.key, "Issue")) });
  }),
);

// A direct human move on Jira's own workflow, not an agent write, so no gate.
jiraRouter.post(
  "/issues/:key/transitions",
  asyncHandler(async (req, res) => {
    const key = idParam(req.params.key, "Issue");
    const { transitionId } = parseOrThrow(transitionBodySchema, req.body);
    await jira.transitionIssue(key, transitionId);
    const issue = await jira.getIssue(key);
    await writeAudit({ ...auditActor(req), action: "jira.issue.transition", entityType: "jira_issue", entityId: key, metadata: { transitionId, toStatus: issue.status } });
    res.json({ issue });
  }),
);

jiraRouter.get(
  "/issues/:key/comments",
  asyncHandler(async (req, res) => {
    res.json({ comments: await jira.getComments(idParam(req.params.key, "Issue")) });
  }),
);

jiraRouter.post(
  "/issues/:key/comments",
  asyncHandler(async (req, res) => {
    const key = idParam(req.params.key, "Issue");
    const { body } = parseOrThrow(commentBodySchema, req.body);
    const comment = await jira.addComment(key, body);
    await writeAudit({ ...auditActor(req), action: "jira.issue.comment", entityType: "jira_issue", entityId: key, metadata: { commentId: comment.id } });
    res.status(201).json({ comment });
  }),
);
