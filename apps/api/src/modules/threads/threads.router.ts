import { Router } from "express";
import { currentUser } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { agentTurnLimit } from "../../middleware/limits.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { startTurnAndStream } from "../orchestration/index.js";
import { assertCanReadAgent, assertCanRunAgent } from "../policy/index.js";
import { runtimeClient } from "../runtime/index.js";
import { agentQuerySchema, createThreadSchema, sendMessageSchema, updateThreadSchema } from "./threads.schemas.js";
import { assertCanSendMessage, deleteThread, listThreads, ownedThread, threadHistory, toThreadView } from "./threads.service.js";

export const threadsRouter = Router();

const threadIdOf = (value: string | undefined) => idParam(value, "Conversation");

threadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    assertCanReadAgent(user.role, agentId);
    res.json({ threads: await listThreads(agentId, user.id) });
  }),
);

threadsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, title } = parseOrThrow(createThreadSchema, req.body);
    assertCanRunAgent(user.role, agentId);
    const thread = await runtimeClient.createThread(agentId, user.id, title, { createdByRole: user.role });
    await writeAudit({ ...auditActor(req), action: "thread.created", entityType: "thread", entityId: thread.id, metadata: { agentId } });
    res.status(201).json({ thread: toThreadView(thread) });
  }),
);

threadsRouter.get(
  "/:threadId/messages",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    assertCanReadAgent(user.role, agentId);
    const thread = await ownedThread(agentId, threadIdOf(req.params.threadId), user.id);
    res.json(await threadHistory(agentId, thread, user));
  }),
);

threadsRouter.post(
  "/:threadId/messages",
  agentTurnLimit,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, message } = parseOrThrow(sendMessageSchema, req.body);
    assertCanRunAgent(user.role, agentId);
    const thread = await ownedThread(agentId, threadIdOf(req.params.threadId), user.id);
    await assertCanSendMessage(thread.id, user.id);
    await startTurnAndStream(req, res, { user, agentId, threadId: thread.id, message });
  }),
);

threadsRouter.patch(
  "/:threadId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId, title } = parseOrThrow(updateThreadSchema, req.body);
    assertCanReadAgent(user.role, agentId);
    const thread = await ownedThread(agentId, threadIdOf(req.params.threadId), user.id);
    const updated = await runtimeClient.updateThread(agentId, thread.id, { title });
    await writeAudit({ ...auditActor(req), action: "thread.updated", entityType: "thread", entityId: thread.id, metadata: { agentId, title } });
    res.json({ thread: toThreadView(updated) });
  }),
);

threadsRouter.delete(
  "/:threadId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { agentId } = parseOrThrow(agentQuerySchema, req.query);
    assertCanReadAgent(user.role, agentId);
    const thread = await ownedThread(agentId, threadIdOf(req.params.threadId), user.id);
    await deleteThread(agentId, thread.id);
    await writeAudit({ ...auditActor(req), action: "thread.deleted", entityType: "thread", entityId: thread.id, metadata: { agentId } });
    res.status(204).send();
  }),
);
