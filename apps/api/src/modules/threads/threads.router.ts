import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { conflict, forbidden, notFound } from "../../lib/http/errors.js";
import { SseWriter } from "../../lib/http/sse.js";
import { agentIdSchema, idParam, parseOrThrow } from "../../lib/http/validate.js";
import { agentTurnLimit } from "../../middleware/limits.js";
import { currentUser } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { approvalsRepository } from "../approvals/approvals.repository.js";
import { toApprovalView } from "../approvals/approvals.service.js";
import { assertCanRunAgent, canReadAgent } from "../policy/policy.js";
import { runsRepository } from "../runs/runs.repository.js";
import { ACTIVE_RUN_STATUSES, toRunView } from "../runs/runs.types.js";
import { startTurn } from "../orchestration/run-stream.service.js";
import { runtimeClient } from "../runtime/runtime.client.js";
import { normalizeMessages } from "../runtime/runtime.messages.js";

// Conversations live in the runtime's memory (Mastra threads keyed by the AURA user id as
// resource). The API scopes every call to the caller so one user never sees another's thread.

export const threadsRouter = Router();

const agentQuerySchema = z.object({ agentId: agentIdSchema }).strict();

threadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    if (!canReadAgent(user.role, agentId)) throw forbidden("Your role cannot access this agent");
    const list = await runtimeClient.listThreads(agentId, user.id);
    const threads = [...list.threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ threads: threads.map((t) => ({ id: t.id, title: t.title ?? null, createdAt: t.createdAt, updatedAt: t.updatedAt })) });
  }),
);

const createThreadSchema = z.object({ agentId: agentIdSchema, title: z.string().trim().max(200).optional() }).strict();

threadsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, title } = parseOrThrow(createThreadSchema, req.body);
    assertCanRunAgent(user.role, agentId);
    const thread = await runtimeClient.createThread(agentId, user.id, title, { createdByRole: user.role });
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "thread.created",
      entityType: "thread",
      entityId: thread.id,
      requestId: req.requestId,
      metadata: { agentId },
    });
    res.status(201).json({ thread: { id: thread.id, title: thread.title ?? null, createdAt: thread.createdAt, updatedAt: thread.updatedAt } });
  }),
);

async function ownedThread(agentId: string, threadId: string, userId: string) {
  const thread = await runtimeClient.getThread(agentId, threadId).catch(() => null);
  if (!thread) throw notFound("Conversation");
  if (thread.resourceId !== userId) throw forbidden("This conversation belongs to another user");
  return thread;
}

// GET /threads/:id/messages: history plus the latest run and any pending approval, so the
// workspace can rebuild its state after a reload without a second round of calls.
threadsRouter.get(
  "/:threadId/messages",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    if (!canReadAgent(user.role, agentId)) throw forbidden("Your role cannot access this agent");
    const thread = await ownedThread(agentId, idParam(req.params.threadId, "Conversation"), user.id);

    const [raw, latestRun, pending] = await Promise.all([
      runtimeClient.listMessages(agentId, thread.id, user.id),
      runsRepository.findLatestForThread(thread.id),
      approvalsRepository.list({ threadId: thread.id, status: ["PENDING"], limit: 1 }),
    ]);

    const pendingApproval = pending[0] ? await toApprovalView(pending[0], user) : null;
    res.json({
      thread: { id: thread.id, title: thread.title ?? null, createdAt: thread.createdAt, updatedAt: thread.updatedAt },
      messages: normalizeMessages(raw.messages),
      latestRun: latestRun ? toRunView(latestRun) : null,
      pendingApproval,
    });
  }),
);

const sendMessageSchema = z.object({ agentId: agentIdSchema, message: z.string().trim().min(1).max(20_000) }).strict();

// POST /threads/:id/messages: starts a turn and streams the runtime's progress back as SSE.
threadsRouter.post(
  "/:threadId/messages",
  agentTurnLimit,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, message } = parseOrThrow(sendMessageSchema, req.body);
    assertCanRunAgent(user.role, agentId);
    const thread = await ownedThread(agentId, idParam(req.params.threadId, "Conversation"), user.id);

    const active = await runsRepository.list({ threadId: thread.id, status: ACTIVE_RUN_STATUSES, limit: 1 });
    if (active[0]) {
      throw conflict(
        active[0].status === "SUSPENDED_FOR_APPROVAL"
          ? "This conversation is waiting on a human decision. Resolve the pending gate before sending another message."
          : "This conversation already has a run in progress.",
      );
    }

    const writer = new SseWriter(req, res);
    await startTurn({ user, agentId, threadId: thread.id, message, requestId: req.requestId, writer });
    writer.end();
  }),
);

const updateThreadSchema = z.object({ agentId: agentIdSchema, title: z.string().trim().min(1).max(200) }).strict();

threadsRouter.patch(
  "/:threadId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, title } = parseOrThrow(updateThreadSchema, req.body);
    const thread = await ownedThread(agentId, idParam(req.params.threadId, "Conversation"), user.id);
    const updated = await runtimeClient.updateThread(agentId, thread.id, { title });
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "thread.updated",
      entityType: "thread",
      entityId: thread.id,
      requestId: req.requestId,
      metadata: { agentId, title },
    });
    res.json({ thread: { id: updated.id, title: updated.title ?? null, createdAt: updated.createdAt, updatedAt: updated.updatedAt } });
  }),
);

threadsRouter.delete(
  "/:threadId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    const thread = await ownedThread(agentId, idParam(req.params.threadId, "Conversation"), user.id);
    const active = await runsRepository.list({ threadId: thread.id, status: ACTIVE_RUN_STATUSES, limit: 1 });
    if (active[0]) throw conflict("A conversation with an active run cannot be deleted");
    await runtimeClient.deleteThread(agentId, thread.id);
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "thread.deleted",
      entityType: "thread",
      entityId: thread.id,
      requestId: req.requestId,
      metadata: { agentId },
    });
    res.status(204).send();
  }),
);

