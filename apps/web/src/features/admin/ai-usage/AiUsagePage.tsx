import { useState } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { aiUsageApi } from "./api.ts";
import { agentLabel } from "@/shared/lib/agents.ts";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { CardHeader } from "@/shared/ui/CardHeader.tsx";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Stat } from "@/shared/ui/Stat.tsx";
import { Select } from "@/shared/ui/Select.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/Table.tsx";
import { BoltIcon } from "@/shared/icons/index.tsx";



const num = (n: number) => n.toLocaleString();
const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

function ShareBar({ share }: { share: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-soft">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-600">{Math.round(share * 100)}%</span>
    </div>
  );
}

export function AiUsagePage() {
  const [days, setDays] = useState(7);
  const usage = useAsync(() => aiUsageApi.tokenUsage(days), [days]);
  const quality = useAsync(() => aiUsageApi.agentQuality(Math.max(days, 30)), [days]);
  const t = usage.data?.totals;

  return (
    <>
      <PageHeader
        title="AI Usage & Quality"
        description="Where the AI's tokens go, and how often people approve each agent's work. Token counts come from the runtime; decisions come from the approval record."
        actions={
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-36 text-sm">
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />

      {usage.error ? <Alert tone="danger">{usage.error}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Model calls" value={t ? num(t.calls) : "-"} icon={<BoltIcon className="size-4" />} />
        <Stat label="Tokens read (input)" value={t ? num(t.input) : "-"} hint={t && t.cached ? `${num(t.cached)} served from cache` : undefined} />
        <Stat label="Tokens written (output)" value={t ? num(t.output) : "-"} hint={t && t.reasoning ? `${num(t.reasoning)} of them hidden reasoning` : undefined} />
        <Stat
          label="Kept out of AI context"
          value={usage.data ? `~${num(usage.data.contextSaved.approxTokens)}` : "-"}
          hint="Draft text shown to people directly, not re-read by the Orchestrator (since the runtime started)"
        />
      </div>

      <Card>
        <CardHeader title="Tokens by agent" description={usage.data ? `Since ${usage.data.since}. Average per call shows which agent to optimise first.` : undefined} />
        {usage.loading && !usage.data ? (
          <SkeletonRows rows={5} />
        ) : !usage.data?.agents.length ? (
          <EmptyState icon={<BoltIcon className="size-5" />} title="No model calls recorded yet" description="Token usage appears here once agents have run." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Agent</TH>
                <TH className="text-right">Calls</TH>
                <TH className="text-right">Input</TH>
                <TH className="text-right">Output</TH>
                <TH className="text-right">Avg in / call</TH>
                <TH className="text-right">Avg out / call</TH>
                <TH>Share of all tokens</TH>
              </TR>
            </THead>
            <TBody>
              {usage.data.agents.map((a) => (
                <TR key={a.agent}>
                  <TD className="text-sm font-medium text-ink-900">{agentLabel(a.agent)}</TD>
                  <TD className="text-right tabular-nums">{num(a.calls)}</TD>
                  <TD className="text-right tabular-nums">{num(a.input)}</TD>
                  <TD className="text-right tabular-nums">{num(a.output)}</TD>
                  <TD className="text-right tabular-nums">{num(a.avgInput)}</TD>
                  <TD className="text-right tabular-nums">{num(a.avgOutput)}</TD>
                  <TD>
                    <ShareBar share={a.share} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {usage.data?.models.length ? (
        <Card>
          <CardHeader title="Tokens by model" description="The model that actually answered, after any fallback. A large fallback share means the primary model is failing or rate limited." />
          <Table>
            <THead>
              <TR>
                <TH>Model</TH>
                <TH className="text-right">Calls</TH>
                <TH className="text-right">Input</TH>
                <TH className="text-right">Output</TH>
              </TR>
            </THead>
            <TBody>
              {usage.data.models.map((m) => (
                <TR key={m.model}>
                  <TD className="font-mono text-xs text-ink-900">{m.model}</TD>
                  <TD className="text-right tabular-nums">{num(m.calls)}</TD>
                  <TD className="text-right tabular-nums">{num(m.input)}</TD>
                  <TD className="text-right tabular-nums">{num(m.output)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Agent quality from real decisions"
          description={quality.data ? `Gates raised since ${quality.data.since.slice(0, 10)}. First-pass = the first draft in a conversation was approved without changes.` : undefined}
        />
        {quality.error ? <Alert tone="danger">{quality.error}</Alert> : null}
        {quality.loading && !quality.data ? (
          <SkeletonRows rows={4} />
        ) : !quality.data?.agents.length ? (
          <EmptyState title="No decisions yet" description="Quality shows up once people approve, revise or reject agents' drafts." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Agent</TH>
                <TH className="text-right">Gates</TH>
                <TH className="text-right">Approved</TH>
                <TH className="text-right">Revised</TH>
                <TH className="text-right">Rejected</TH>
                <TH className="text-right">Approval rate</TH>
                <TH className="text-right">First-pass</TH>
                <TH className="text-right">Median time to decide</TH>
              </TR>
            </THead>
            <TBody>
              {quality.data.agents.map((q) => (
                <TR key={q.agent}>
                  <TD className="text-sm font-medium text-ink-900">{agentLabel(q.agent)}</TD>
                  <TD className="text-right tabular-nums">{q.gates}</TD>
                  <TD className="text-right tabular-nums">{q.approve}</TD>
                  <TD className="text-right tabular-nums">{q.revise}</TD>
                  <TD className="text-right tabular-nums">{q.reject}</TD>
                  <TD className="text-right tabular-nums">{pct(q.approvalRate)}</TD>
                  <TD className="text-right tabular-nums">{pct(q.firstPassRate)}</TD>
                  <TD className="text-right tabular-nums">{q.medianDecisionMinutes === null ? "-" : `${q.medianDecisionMinutes} min`}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
