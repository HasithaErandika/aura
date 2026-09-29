import { supabaseAdmin } from "../../lib/supabase.js";
import { upstreamError } from "../../lib/http/errors.js";

// Agent quality from real outcomes (docs/ARCHITECTURE.md §6.2): how humans decided on each agent's
// gates. Offline evals say whether a prompt is good on fixed cases; this says whether the drafts
// people actually got were good enough to approve.

export interface AgentQualityRow {
  agent: string;
  gates: number; // approval requests raised for this agent's output
  decided: number;
  approve: number;
  revise: number;
  reject: number;
  answer: number;
  expired: number;
  pending: number;
  approvalRate: number | null; // approve / decided
  firstPassRate: number | null; // threads where the first decision was approve / threads decided
  medianDecisionMinutes: number | null;
}

export interface QualityInputRow {
  producing_agent: string | null;
  thread_id: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  approval_decisions: { decision: string; created_at: string }[] | null;
}

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function aggregateQuality(rows: QualityInputRow[]): AgentQualityRow[] {
  const byAgent = new Map<string, QualityInputRow[]>();
  for (const row of rows) {
    if (!row.producing_agent) continue; // a clarification question, not a gate on an agent's output
    const list = byAgent.get(row.producing_agent) ?? [];
    list.push(row);
    byAgent.set(row.producing_agent, list);
  }
  const out: AgentQualityRow[] = [];
  for (const [agent, list] of byAgent) {
    const counts = { approve: 0, revise: 0, reject: 0, answer: 0 };
    const minutes: number[] = [];
    let expired = 0;
    let pending = 0;
    // First decision per thread, in time order.
    const firstByThread = new Map<string, { at: string; decision: string }>();
    for (const row of list) {
      if (row.status === "PENDING") pending++;
      if (row.status === "EXPIRED") expired++;
      const decision = [...(row.approval_decisions ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (!decision) continue;
      if (decision.decision in counts) counts[decision.decision as keyof typeof counts]++;
      if (row.decided_at) minutes.push((new Date(row.decided_at).getTime() - new Date(row.requested_at).getTime()) / 60_000);
      const first = firstByThread.get(row.thread_id);
      if (!first || row.requested_at < first.at) firstByThread.set(row.thread_id, { at: row.requested_at, decision: decision.decision });
    }
    const decided = counts.approve + counts.revise + counts.reject + counts.answer;
    const firstPass = [...firstByThread.values()].filter((f) => f.decision === "approve").length;
    out.push({
      agent,
      gates: list.length,
      decided,
      ...counts,
      expired,
      pending,
      approvalRate: ratio(counts.approve, decided),
      firstPassRate: ratio(firstPass, firstByThread.size),
      medianDecisionMinutes: median(minutes),
    });
  }
  return out.sort((a, b) => b.gates - a.gates);
}

export async function agentQuality(days: number): Promise<{ since: string; agents: AgentQualityRow[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("approval_requests")
    .select("producing_agent, thread_id, status, requested_at, decided_at, approval_decisions (decision, created_at)")
    .gte("requested_at", since)
    .limit(5000);
  if (error) throw upstreamError(error.message);
  return { since, agents: aggregateQuality((data ?? []) as unknown as QualityInputRow[]) };
}
