import { stdin } from "node:process";
import type { Approval, Decision } from "@aura/client";
import { updateTaskState } from "../config.js";
import { findWorktree, normalizeTaskKey, resolveTask, session, taskFromCwd, type Session } from "../context.js";
import { renderTurn, type TurnOutcome } from "../render.js";
import { ask, c, out } from "../ui.js";

export const CODING_PROVIDERS = ["council", "mastra"] as const;
export type CodingProviderArg = (typeof CODING_PROVIDERS)[number];

async function threadFor(s: Session, taskKey: string, fresh: boolean): Promise<string> {
  const existing = s.config.tasks[taskKey]?.threadId;
  if (existing && !fresh) return existing;
  const thread = await s.client.threads.create(`${taskKey} · coding (aura CLI)`);
  await updateTaskState(s.config, taskKey, { threadId: thread.id, lastApprovalId: undefined, lastDraftId: undefined });
  return thread.id;
}

async function remember(s: Session, taskKey: string | null, outcome: TurnOutcome): Promise<void> {
  if (!taskKey || !s.config.tasks[taskKey]) return;
  await updateTaskState(s.config, taskKey, {
    lastApprovalId: outcome.approvalId ?? undefined,
    ...(outcome.draftId ? { lastDraftId: outcome.draftId } : {}),
  });
}

// After a turn stops at a gate, offer to decide it right here when there is a terminal to ask
// on - the decision still goes through POST /approvals/:id/decide exactly like the web inbox.
async function maybePromptDecision(s: Session, taskKey: string | null, outcome: TurnOutcome, prompt: boolean): Promise<void> {
  let current = outcome;
  while (prompt && stdin.isTTY && current.approvalId && current.status === "SUSPENDED_FOR_APPROVAL") {
    const answer = (await ask(`${c.bold("Decide now?")} [a]pprove / [r]eject / re[v]ise / [l]ater: `)).toLowerCase();
    if (answer === "a" || answer === "approve") {
      current = await decide(s, taskKey, current.approvalId, "approve", {});
    } else if (answer === "r" || answer === "reject") {
      const reason = await ask("Reason: ");
      current = await decide(s, taskKey, current.approvalId, "reject", { reason });
    } else if (answer === "v" || answer === "revise") {
      const feedback = await ask("What should change? ");
      current = await decide(s, taskKey, current.approvalId, "revise", { answer: feedback });
    } else {
      out(c.gray("Left pending - decide later with `aura approve` / `aura reject`."));
      return;
    }
  }
}

async function decide(s: Session, taskKey: string | null, approvalId: string, decision: Decision, body: { answer?: string; reason?: string }): Promise<TurnOutcome> {
  const approval = await s.client.approvals.get(approvalId);
  if (approval.status !== "PENDING") throw new Error(`Approval ${approvalId} is already ${approval.status.toLowerCase()}`);
  out(c.gray(`${decision} → ${approval.gate ? `Gate ${approval.gate.number} · ${approval.gate.name}` : approval.question.split("\n")[0]}`));
  // snapshotHash pins the decision to exactly what was shown; the API rejects it if the gate's
  // content changed in between.
  const outcome = await renderTurn(s.client.approvals.decide(approvalId, { decision, snapshotHash: approval.snapshotHash, ...body }));
  await remember(s, taskKey, outcome);
  return outcome;
}

export async function code(taskArg: string | undefined, opts: { epic?: string; provider: CodingProviderArg; newThread?: boolean; note?: string; prompt: boolean; verbose?: boolean }): Promise<void> {
  const s = await session();
  const taskKey = await resolveTask(taskArg);
  const worktree = await findWorktree(s.client, taskKey);
  const epicKey = opts.epic ? normalizeTaskKey(opts.epic) : worktree?.epicKey;
  if (!epicKey) throw new Error(`${taskKey} has no worktree yet, so its Epic is unknown - pass --epic <KEY> and AURA will draft its scaffold first.`);

  const threadId = await threadFor(s, taskKey, Boolean(opts.newThread));
  // Every argument delegate_to_code needs is spelled out, so the Orchestrator never has to infer
  // one (a dropped `mode` on a resumed call is a known failure - docs/logs/dev-coding-run-KAN-45.md).
  const message = worktree
    ? [
        `Draft the coding plan for Task ${taskKey} in Epic ${epicKey}: call delegate_to_code with mode "draft", epicKey "${epicKey}", taskKey "${taskKey}", provider "${opts.provider}".`,
        "Show me the plan, then ask me to approve it before executing. When I approve, call delegate_to_code with mode \"execute\", the returned draftId, and approved true.",
        opts.note ? `Developer note: ${opts.note}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Task ${taskKey} in Epic ${epicKey} has no worktree yet. Draft its Dev scaffold first with delegate_to_dev for Task ${taskKey} in Epic ${epicKey} and ask me to approve it.`,
        `After that is done, draft its coding plan with delegate_to_code (mode "draft", epicKey "${epicKey}", taskKey "${taskKey}", provider "${opts.provider}") and ask me to approve that too.`,
      ].join("\n");

  out(c.gray(`${taskKey} · ${epicKey} · provider ${opts.provider} · thread ${threadId}`));
  out();
  const outcome = await renderTurn(s.client.threads.send(threadId, message), { verbose: opts.verbose });
  await remember(s, taskKey, outcome);
  await maybePromptDecision(s, taskKey, outcome, opts.prompt);
}

// Picks the gate to decide: an explicit id, else the last gate the CLI saw for the current
// Task, else the only pending gate this user can decide.
async function pickApproval(s: Session, idArg: string | undefined): Promise<{ id: string; taskKey: string | null }> {
  const taskKey = await taskFromCwd();
  if (idArg) return { id: idArg, taskKey };
  const remembered = taskKey ? s.config.tasks[taskKey]?.lastApprovalId : undefined;
  const pending = (await s.client.approvals.list(["PENDING"])).filter((a) => a.canDecide);
  if (remembered && pending.some((a) => a.id === remembered)) return { id: remembered, taskKey };
  if (pending.length === 1) return { id: pending[0]!.id, taskKey: taskForThread(s, pending[0]!) };
  if (pending.length === 0) throw new Error("Nothing is waiting on you.");
  out("Several gates are waiting on you - pass one id:");
  for (const a of pending) out(`  ${a.id}  ${a.gate ? `Gate ${a.gate.number} · ${a.gate.name}` : a.question.split("\n")[0]}`);
  throw new Error("Ambiguous approval");
}

function taskForThread(s: Session, approval: Approval): string | null {
  return Object.entries(s.config.tasks).find(([, state]) => state.threadId === approval.threadId)?.[0] ?? null;
}

export async function approve(idArg: string | undefined, opts: { answer?: string; prompt: boolean }): Promise<void> {
  const s = await session();
  const { id, taskKey } = await pickApproval(s, idArg);
  const outcome = await decide(s, taskKey, id, "approve", opts.answer ? { answer: opts.answer } : {});
  await maybePromptDecision(s, taskKey, outcome, opts.prompt);
}

export async function reject(idArg: string | undefined, opts: { reason: string }): Promise<void> {
  const s = await session();
  const { id, taskKey } = await pickApproval(s, idArg);
  await decide(s, taskKey, id, "reject", { reason: opts.reason });
}

export async function revise(feedback: string, opts: { id?: string; prompt: boolean }): Promise<void> {
  const s = await session();
  const { id, taskKey } = await pickApproval(s, opts.id);
  const outcome = await decide(s, taskKey, id, "revise", { answer: feedback });
  await maybePromptDecision(s, taskKey, outcome, opts.prompt);
}

// Adds a note to the next Coding Council round of the Task's current run.
export async function say(text: string, opts: { task?: string; draft?: string }): Promise<void> {
  const s = await session();
  let draftId = opts.draft;
  if (!draftId) {
    const taskKey = await resolveTask(opts.task);
    draftId = s.config.tasks[taskKey]?.lastDraftId;
    if (!draftId) throw new Error(`No council run known for ${taskKey} - start one with \`aura code ${taskKey}\`, or pass --draft <id>.`);
  }
  const { queued } = await s.client.council.note(draftId, text);
  out(`${c.green("✓")} Queued for the next council round (${queued} note${queued === 1 ? "" : "s"} waiting)`);
}
