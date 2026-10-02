import { createTool } from '@mastra/core/tools';
import { AGENT_MANIFEST } from '../agents/registry';
import { draftStore } from '../store/draft-store';
import { metrics } from '../lib/metrics';
import { claimApproval } from './approval-ledger';
import { authorizesGatedStep, decisionFrom, runFrom } from './context';
import { LoopGuard, limitsFromEnv } from './loop-guard';
import { riskOf } from './risk';
import { collectFindings, findingsBanner, injectionPolicy, type Finding } from './untrusted';
import { settingsFrom } from '../config/settings';
import { withTurnContext } from '../config/turn-context';

// The tool gateway (docs/ARCHITECTURE.md §6.2).
// Every delegate tool of the Orchestrator and the vscode-agent is wrapped by governed(), so each call goes through the
// same steps in one place:
//
//   1. risk tier     tool + mode looked up in risk.ts; unknown = refused
//   2. loop guard    identical repeats, failure streaks, endless revisions (loop-guard.ts)
//   3. human gate    medium tier: approved=true AND a human approve/answer decision resumed this
//                    turn (sent by apps/api, context.ts) AND that decision not yet used for a
//                    different step (approval-ledger.ts)
//   4. execute       inside a trace span tagged with the AURA run, and an untrusted-content
//                    collector (untrusted.ts)
//   5. record        metrics, a structured log line, and a `data-gateway` event that apps/api
//                    stores as a run step and, for refusals, in the audit log
//
// Schema validation happens before this (Mastra validates inputSchema). Authorization by role
// happens before the turn starts, in apps/api (policy.ts); this gateway never decides who may act,
// only that a gated step has a real, unused human decision behind it.

export type BlockReason = 'unknown_mode' | 'loop_guard' | 'not_approved' | 'no_human_decision' | 'missing_draft' | 'approval_reused' | 'injection';

export interface GatewayEvent {
  tool: string;
  mode: string;
  tier: string;
  outcome: 'ok' | 'failed' | 'blocked' | 'error';
  reason?: BlockReason;
  message?: string;
  runId: string | null;
  threadId: string | null;
  approvalId: string | null;
  decidedBy: string | null;
  durationMs: number;
  findings?: Finding[];
  // provider/model ids that answered inside this call, for the audit trail (step 4.2).
  models?: string[];
}

// Structural view of what a Mastra tool looks like to the gateway.
interface ToolLike {
  id: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  execute?: (input: never, context: never) => Promise<unknown>;
}

interface ContextLike {
  agent?: { threadId?: string };
  requestContext?: { get: (key: string) => unknown };
  writer?: { custom: (chunk: { type: `data-${string}`; data: unknown }) => Promise<void> };
  observe?: { span: <T>(name: string, fn: () => Promise<T>, attributes?: Record<string, unknown>) => Promise<T> };
}

const REVISE_MODES = new Set(['revise', 'revise-scenario']);

export const loopGuard = new LoopGuard(limitsFromEnv());

async function emit(context: ContextLike, event: GatewayEvent): Promise<void> {
  console.log(`[aura-gateway] ${JSON.stringify({ ...event, findings: event.findings?.length ?? 0 })}`);
  try {
    await context.writer?.custom({ type: 'data-gateway', data: event });
  } catch {
    // A closed stream must never turn a finished step into a failure.
  }
}

export async function runGoverned(tool: ToolLike, input: Record<string, unknown>, context: ContextLike): Promise<unknown> {
  const started = performance.now();
  const mode = typeof input?.mode === 'string' ? input.mode : '(none)';
  const risk = riskOf(tool.id, input?.mode);
  const threadId = context.agent?.threadId ?? null;
  const run = runFrom(context.requestContext);
  const decision = decisionFrom(context.requestContext);
  const base = {
    tool: tool.id,
    mode,
    tier: risk?.tier ?? 'unknown',
    runId: run?.runId ?? null,
    threadId,
    approvalId: decision?.approvalId ?? null,
    decidedBy: decision?.userId ?? null,
  };
  const elapsed = () => Math.round(performance.now() - started);

  const refuse = async (reason: BlockReason, message: string) => {
    metrics.gatewayBlocks.inc({ tool: tool.id, reason });
    metrics.toolCalls.inc({ tool: tool.id, mode, tier: base.tier, outcome: 'blocked' });
    await emit(context, { ...base, outcome: 'blocked', reason, message, durationMs: elapsed() });
    return { ok: false, error: `AURA gateway refused ${tool.id} (${mode}): ${message}` };
  };

  if (!risk || !tool.execute) return refuse('unknown_mode', `no risk tier is defined for mode "${mode}"`);

  const draftId = typeof input.draftId === 'string' ? input.draftId : null;
  const revising = REVISE_MODES.has(mode);
  const draftVersion = revising && draftId ? ((await draftStore.get(draftId))?.version ?? null) : null;
  const tripped = loopGuard.check(threadId ?? 'no-thread', tool.id, input, decision?.approvalId ?? null, draftVersion, revising);
  if (tripped) return refuse('loop_guard', tripped);

  if (risk.tier === 'medium') {
    if (input.approved !== true) return refuse('not_approved', 'approved=true is required, and only after ask_user returned an approval');
    if (!decision || !authorizesGatedStep(decision)) {
      return refuse('no_human_decision', decision ? `the human decision on this turn was "${decision.decision}", which doesn't authorize it` : 'no human approval resumed this turn');
    }
    if (!draftId) return refuse('missing_draft', 'draftId is required');
    const claim = await claimApproval(decision.approvalId, tool.id, draftId, threadId);
    if (!claim.ok) return refuse('approval_reused', `approval ${decision.approvalId} was already used for ${claim.usedFor.tool} on draft ${claim.usedFor.draftId}; each approval covers one step`);
    if (claim.firstUse) metrics.approvalsUsed.inc({ tool: tool.id });
  }

  const manifest = AGENT_MANIFEST[risk.agentId];
  const attributes = {
    'aura.run_id': base.runId,
    'aura.request_id': run?.requestId ?? null,
    'aura.thread_id': threadId,
    'aura.tool': tool.id,
    'aura.mode': mode,
    'aura.risk_tier': risk.tier,
    'aura.agent': risk.agentId,
    'aura.agent_version': manifest.agentVersion,
    'aura.prompt_version': manifest.promptVersion,
    'aura.approval_id': base.approvalId,
    'aura.decided_by': base.decidedBy,
  };
  const execute = tool.execute as (input: unknown, context: unknown) => Promise<unknown>;
  let models: string[] = [];
  const call = async () => {
    const ran = await withTurnContext(context.requestContext, () => execute(input, context));
    models = ran.models;
    return ran.result;
  };

  let result: unknown;
  let findings: Finding[] = [];
  try {
    ({ result, findings } = await collectFindings(() => (context.observe ? context.observe.span(`gateway ${tool.id}.${mode}`, call, attributes) : call())));
  } catch (error) {
    loopGuard.record(threadId ?? 'no-thread', tool.id, false, base.approvalId);
    metrics.toolCalls.inc({ tool: tool.id, mode, tier: risk.tier, outcome: 'error' });
    const message = error instanceof Error ? error.message : String(error);
    await emit(context, { ...base, outcome: 'error', message, durationMs: elapsed(), ...(models.length ? { models } : {}) });
    return { ok: false, error: message };
  }

  for (const f of findings) metrics.untrustedFindings.inc({ rule: f.rule, severity: f.severity });
  if (findings.some((f) => f.severity === 'high') && (settingsFrom(context.requestContext).injectionPolicy ?? injectionPolicy()) === 'block') {
    loopGuard.record(threadId ?? 'no-thread', tool.id, false, base.approvalId);
    metrics.gatewayBlocks.inc({ tool: tool.id, reason: 'injection' });
    metrics.toolCalls.inc({ tool: tool.id, mode, tier: risk.tier, outcome: 'blocked' });
    await emit(context, { ...base, outcome: 'blocked', reason: 'injection', message: 'high-severity prompt-injection finding (INJECTION_POLICY=block)', findings, durationMs: elapsed(), ...(models.length ? { models } : {}) });
    return { ok: false, error: `AURA gateway withheld the result of ${tool.id} (${mode}): the source content looks like a prompt-injection attempt (${findings.map((f) => `${f.rule} in ${f.source}`).join('; ')}). A human should check the Jira content first.` };
  }

  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (record && findings.length && typeof record.markdown === 'string') {
    result = { ...record, markdown: `${findingsBanner(findings)}\n${record.markdown}` };
  }
  result = await deliverDraft(tool.id, mode, result, context);

  const ok = record?.ok === true;
  const outcome = ok ? 'ok' : 'failed';
  loopGuard.record(threadId ?? 'no-thread', tool.id, ok, base.approvalId);
  metrics.toolCalls.inc({ tool: tool.id, mode, tier: risk.tier, outcome });
  metrics.toolDuration.observe({ tool: tool.id, mode }, (performance.now() - started) / 1000);
  // Every gated step, every finding and every model call is worth a run step (the audit records
  // which provider saw the data); routine low-risk calls without a model only go to the log.
  const event: GatewayEvent = { ...base, outcome, durationMs: elapsed(), ...(findings.length ? { findings } : {}), ...(models.length ? { models } : {}) };
  if (risk.tier === 'medium' || findings.length || models.length) await emit(context, event);
  else console.log(`[aura-gateway] ${JSON.stringify({ ...event, findings: 0 })}`);
  return result;
}

// Token saver: a draft (Epic, Stories, architecture, test plan...) goes to the human in full as a
// `data-draft` chunk, and the Orchestrator's model only gets a short preview. Before this, the
// full markdown sat in the Orchestrator's context for every later step of the turn and for the
// next 32 messages, and the model re-typed it as its own reply. Mastra saves data-* chunks to the
// thread (so history still shows the draft) but never puts them in a model prompt. apps/api
// relays the chunk as the chat text and the approval snapshot (run-stream.service.ts).
export const DRAFT_PREVIEW_CHARS = 400;

export function draftPreview(markdown: string): string {
  const head = markdown.length > DRAFT_PREVIEW_CHARS ? `${markdown.slice(0, DRAFT_PREVIEW_CHARS).trimEnd()}…` : markdown;
  return `[Shown to the human in full by AURA (${markdown.length} characters). Do not repeat it. Preview:]\n${head}`;
}

async function deliverDraft(tool: string, mode: string, result: unknown, context: ContextLike): Promise<unknown> {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const markdown = record && typeof record.markdown === 'string' ? record.markdown : null;
  // Without a stream (e.g. a direct tool call) nobody else would show it: keep it inline.
  if (!record || !markdown || !context.writer) return result;
  try {
    await context.writer.custom({ type: 'data-draft', data: { tool, mode, draftId: typeof record.draftId === 'string' ? record.draftId : null, markdown } });
  } catch {
    return result;
  }
  const preview = draftPreview(markdown);
  metrics.contextCharsSaved.inc({ tool }, Math.max(0, markdown.length - preview.length));
  return { ...record, markdown: preview };
}

// Wraps a tool so every call goes through the gateway; id, description and schemas are unchanged.
export function governed<T extends ToolLike>(tool: T): T {
  return createTool({
    id: tool.id,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema as never,
    outputSchema: tool.outputSchema as never,
    execute: (input: unknown, context: unknown) => runGoverned(tool, input as Record<string, unknown>, context as ContextLike) as never,
  }) as unknown as T;
}
