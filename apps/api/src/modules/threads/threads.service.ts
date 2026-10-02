import type { AuthedUser } from "../../lib/auth/user.js";
import { conflict, forbidden, HttpError, notFound, tooManyRequests } from "../../lib/http/errors.js";
import { pendingApprovalForThread, type ApprovalView } from "../approvals/index.js";
import { ACTIVE_RUN_STATUSES, runsRepository, toRunView, type RunView } from "../runs/index.js";
import { normalizeMessages, runtimeClient, type ChatMessage, type RuntimeThread } from "../runtime/index.js";

const MAX_ACTIVE_TURNS_PER_USER = 5;

export interface ThreadView {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toThreadView(t: RuntimeThread): ThreadView {
  return { id: t.id, title: t.title ?? null, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

export async function ownedThread(agentId: string, threadId: string, userId: string): Promise<RuntimeThread> {
  const thread = await runtimeClient.getThread(agentId, threadId).catch((error: unknown) => {
    if (error instanceof HttpError && error.code === "runtime_unavailable") throw error;
    return null;
  });
  if (!thread) throw notFound("Conversation");
  if (thread.resourceId !== userId) throw forbidden("This conversation belongs to another user");
  return thread;
}

export async function listThreads(agentId: string, userId: string): Promise<ThreadView[]> {
  const { threads } = await runtimeClient.listThreads(agentId, userId);
  return threads.map(toThreadView).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function threadHistory(
  agentId: string,
  thread: RuntimeThread,
  viewer: AuthedUser,
): Promise<{ thread: ThreadView; messages: ChatMessage[]; latestRun: RunView | null; pendingApproval: ApprovalView | null }> {
  const [raw, latestRun, pendingApproval] = await Promise.all([
    runtimeClient.listMessages(agentId, thread.id, viewer.id),
    runsRepository.findLatestForThread(thread.id),
    pendingApprovalForThread(thread.id, viewer),
  ]);
  return { thread: toThreadView(thread), messages: normalizeMessages(raw.messages), latestRun: latestRun ? toRunView(latestRun) : null, pendingApproval };
}

async function activeRun(threadId: string) {
  const [active] = await runsRepository.list({ threadId, status: ACTIVE_RUN_STATUSES, limit: 1 });
  return active ?? null;
}

export async function assertCanSendMessage(threadId: string, userId: string): Promise<void> {
  const active = await activeRun(threadId);
  if (active) {
    throw conflict(
      active.status === "SUSPENDED_FOR_APPROVAL"
        ? "This conversation is waiting on a human decision. Resolve the pending gate before sending another message."
        : "This conversation already has a run in progress.",
    );
  }
  if ((await runsRepository.countActiveForUser(userId)) >= MAX_ACTIVE_TURNS_PER_USER) {
    throw tooManyRequests(`You already have ${MAX_ACTIVE_TURNS_PER_USER} agent turns queued or running. Wait for one to finish.`);
  }
}

export async function deleteThread(agentId: string, threadId: string): Promise<void> {
  if (await activeRun(threadId)) throw conflict("A conversation with an active run cannot be deleted");
  await runtimeClient.deleteThread(agentId, threadId);
}
