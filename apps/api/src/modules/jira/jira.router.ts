import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canViewJira } from "../policy/policy.js";
import { writeAudit } from "../audit/audit.service.js";
import { jira, jiraConfigured } from "./jira.client.js";

export const jiraRouter = Router();

const querySchema = z.object({ q: z.string().trim().max(200).optional() });
const transitionBodySchema = z.object({ transitionId: z.string().trim().min(1) }).strict();
const commentBodySchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

function assertCanView(role: Parameters<typeof canViewJira>[0]) {
  if (!canViewJira(role)) throw forbidden("Your role cannot browse Jira");
}

// GET /jira/status - whether the API can reach Jira at all, so the UI can show a clear
// "not configured" state instead of a generic error.
jiraRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    res.json({ configured: jiraConfigured });
  }),
);

// GET /jira/epics?q= - lists Epics in the configured project, newest-updated first.
jiraRouter.get(
  "/epics",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const { q } = parseOrThrow(querySchema, req.query);
    const epics = await jira.listEpics(q);
    res.json({ epics });
  }),
);

// GET /jira/epics/:epicKey - one Epic plus the Stories and Tasks filed under it.
jiraRouter.get(
  "/epics/:epicKey",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const epicKey = idParam(req.params.epicKey, "Epic");
    const [epic, children] = await Promise.all([jira.getEpic(epicKey), jira.getEpicChildren(epicKey)]);
    res.json({ epic, ...children });
  }),
);

// GET /jira/issues/:key - a single Story or Task's full detail.
jiraRouter.get(
  "/issues/:key",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const key = idParam(req.params.key, "Issue");
    const issue = await jira.getIssue(key);
    res.json({ issue });
  }),
);

// GET /jira/issues/:key/transitions - the moves available from this issue's current status,
// for a "mark as..." control. Jira's own workflow decides what's offered here, not AURA.
jiraRouter.get(
  "/issues/:key/transitions",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const key = idParam(req.params.key, "Issue");
    const transitions = await jira.getTransitions(key);
    res.json({ transitions });
  }),
);

// POST /jira/issues/:key/transitions - moves an issue through one of those transitions. A
// direct human action on Jira's own board, not an agent write, so it needs no approval gate -
// the same population that can view Jira can move a Task's status, same as Jira's own board
// would let a project member do.
jiraRouter.post(
  "/issues/:key/transitions",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const key = idParam(req.params.key, "Issue");
    const { transitionId } = parseOrThrow(transitionBodySchema, req.body);
    await jira.transitionIssue(key, transitionId);
    const issue = await jira.getIssue(key);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "jira.issue.transition", entityType: "jira_issue", entityId: key, metadata: { transitionId, toStatus: issue.status } });
    res.json({ issue });
  }),
);

// GET /jira/issues/:key/comments - the full comment thread, oldest first.
jiraRouter.get(
  "/issues/:key/comments",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const key = idParam(req.params.key, "Issue");
    const comments = await jira.getComments(key);
    res.json({ comments });
  }),
);

// POST /jira/issues/:key/comments - posts a comment. A direct human action, same reasoning as
// the transition POST above - no approval gate, audited.
jiraRouter.post(
  "/issues/:key/comments",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    assertCanView(user.role);
    const key = idParam(req.params.key, "Issue");
    const { body } = parseOrThrow(commentBodySchema, req.body);
    const comment = await jira.addComment(key, body);
    await writeAudit({ actorId: user.id, actorRole: user.role, action: "jira.issue.comment", entityType: "jira_issue", entityId: key, metadata: { commentId: comment.id } });
    res.json({ comment });
  }),
);
