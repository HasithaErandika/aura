import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { approvalsApi } from "./api.ts";
import { workspaceApi } from "../workspace/api.ts";
import { describeError } from "../../shared/api/errors.ts";
import type { Decision, RunStatus, StreamEvent } from "../../types/api.ts";
import { paths } from "../../app/paths.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { KeyValueList } from "../../shared/ui/KeyValue.tsx";
import { ApprovalStatusPill, RunStatusPill } from "../../shared/ui/StatusPill.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { GateCard } from "../workspace/components/GateCard.tsx";
import { ToolActivity } from "../workspace/components/ToolActivity.tsx";
import { roleLabel } from "../../shared/lib/roles.ts";
import { formatDateTime, timeUntil } from "../../shared/lib/format.ts";
import { ArrowLeftIcon } from "../../shared/icons/index.tsx";
import type { ChatToolActivity } from "../../types/api.ts";

interface Continuation {
  text: string;
  tools: ChatToolActivity[];
  status: RunStatus | null;
  nextApprovalId: string | null;
  error: string | null;
}

export function ApprovalDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const state = useAsync(() => approvalsApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [continuation, setContinuation] = useState<Continuation | null>(null);

  const onEvent = useCallback((event: StreamEvent) => {
    setContinuation((c) => {
      const cur = c ?? { text: "", tools: [], status: null, nextApprovalId: null, error: null };
      switch (event.event) {
        case "text":
          return { ...cur, text: cur.text + event.data.delta };
        case "tool": {
          const tools = [...cur.tools];
          const idx = tools.findIndex((t) => t.toolCallId === event.data.toolCallId);
          const next: ChatToolActivity =
            event.data.phase === "call"
              ? { toolCallId: event.data.toolCallId, toolName: event.data.toolName, state: "call", args: event.data.args }
              : { toolCallId: event.data.toolCallId, toolName: event.data.toolName, state: event.data.phase, args: tools[idx]?.args, result: event.data.result ?? event.data.error, isError: event.data.phase === "error" };
          if (idx >= 0) tools[idx] = next;
          else tools.push(next);
          return { ...cur, tools };
        }
        case "gate":
          return { ...cur, nextApprovalId: event.data.approvalId, status: "SUSPENDED_FOR_APPROVAL" };
        case "error":
          return { ...cur, error: event.data.message };
        case "done":
          return { ...cur, status: event.data.status, nextApprovalId: event.data.approvalId ?? cur.nextApprovalId };
        default:
          return cur;
      }
    });
  }, []);

  async function decide(body: { decision: Decision; answer?: string; reason?: string }) {
    if (!state.data) return;
    setBusy(true);
    setContinuation({ text: "", tools: [], status: null, nextApprovalId: null, error: null });
    try {
      await workspaceApi.decide(state.data.approval.id, { ...body, snapshotHash: state.data.approval.snapshotHash }, onEvent);
    } catch (err) {
      setContinuation((c) => ({ ...(c ?? { text: "", tools: [], status: null, nextApprovalId: null, error: null }), error: describeError(err) }));
    } finally {
      setBusy(false);
      void state.reload();
    }
  }

  if (state.loading && !state.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading request" />
      </div>
    );
  }
  if (state.error || !state.data) return <Alert tone="danger">{state.error ?? "Request not found"}</Alert>;

  const { approval, run } = state.data;
  const title = approval.gate ? `Gate ${approval.gate.number}: ${approval.gate.name}` : "Question from the Orchestrator";

  return (
    <>
      <div>
        <Link to={paths.approvals} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeftIcon className="size-3.5" />
          Back to inbox
        </Link>
      </div>
      <PageHeader
        title={title}
        description={approval.gate ? approval.gate.outcome : "The agent paused to ask the person who started the run."}
        actions={<ApprovalStatusPill status={approval.status} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {approval.snapshot ? (
            <Card>
              <CardHeader title="What you are deciding on" description="Exact agent output at the moment it paused. Your decision is bound to this content." />
              <CardBody>
                <Markdown source={approval.snapshot} className="text-sm text-ink-800" />
              </CardBody>
            </Card>
          ) : null}

          {approval.status === "PENDING" ? (
            <GateCard
              compact
              busy={busy}
              onDecide={(body) => void decide(body)}
              gate={{
                approvalId: approval.id,
                runId: approval.runId,
                producingAgent: approval.producingAgent,
                gate: approval.gate,
                requiredRole: approval.requiredRole,
                question: approval.question,
                options: approval.options,
                selectionMode: approval.selectionMode,
                snapshot: null,
                snapshotHash: approval.snapshotHash,
                expiresAt: approval.expiresAt,
                canDecide: Boolean(approval.canDecide),
              }}
            />
          ) : (
            <Card>
              <CardHeader title="Decision" />
              <CardBody>
                {approval.decision ? (
                  <KeyValueList
                    items={[
                      { label: "Outcome", value: <ApprovalStatusPill status={approval.status} /> },
                      { label: "Decided by", value: roleLabel(approval.decision.decidedByRole) },
                      { label: "When", value: formatDateTime(approval.decision.createdAt) },
                      { label: "Answer", value: approval.decision.answer ?? "" },
                      ...(approval.decision.reason ? [{ label: "Reason", value: approval.decision.reason }] : []),
                    ]}
                  />
                ) : (
                  <p className="text-sm text-ink-600">{approval.status === "EXPIRED" ? "The approval SLA elapsed before anyone decided. The run was closed as expired; it was not auto-approved." : "No decision record."}</p>
                )}
              </CardBody>
            </Card>
          )}

          {continuation ? (
            <Card>
              <CardHeader
                title="Agent continuation"
                description={busy ? "The Orchestrator is continuing with your decision" : continuation.status ? "The turn finished" : undefined}
                actions={continuation.status ? <RunStatusPill status={continuation.status} /> : busy ? <Spinner size="sm" /> : null}
              />
              <CardBody className="space-y-3">
                {continuation.tools.map((t, i) => (
                  <ToolActivity key={t.toolCallId || i} tool={t} />
                ))}
                {continuation.text ? <Markdown source={continuation.text} className="text-sm text-ink-800" /> : null}
                {continuation.error ? <Alert tone="danger">{continuation.error}</Alert> : null}
                {continuation.nextApprovalId ? (
                  <Alert tone="warning" title="The agent paused again" actions={<Link to={paths.approval(continuation.nextApprovalId)} className="text-xs font-semibold underline">Open next request</Link>}>
                    A new decision is waiting.
                  </Alert>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Context" />
            <CardBody>
              <KeyValueList
                className="sm:grid-cols-1"
                items={[
                  { label: "Required role", value: approval.requiredRole ? roleLabel(approval.requiredRole) : "Requester" },
                  { label: "Producing agent", value: approval.producingAgent ?? "Orchestrator" },
                  { label: "Started by", value: approval.requester ? (approval.requester.fullName ?? approval.requester.email) : approval.requestedBy },
                  { label: "Requested", value: formatDateTime(approval.requestedAt) },
                  { label: "Expires", value: approval.status === "PENDING" ? `${formatDateTime(approval.expiresAt)} (${timeUntil(approval.expiresAt)})` : formatDateTime(approval.expiresAt) },
                  { label: "Snapshot hash", value: <span className="font-mono text-xs">{approval.snapshotHash.slice(0, 16)}</span> },
                ]}
              />
            </CardBody>
          </Card>
          {run ? (
            <Card>
              <CardHeader title="Run" actions={<RunStatusPill status={run.status as RunStatus} />} />
              <CardBody className="space-y-3">
                <p className="text-sm text-ink-800">{run.title ?? "Untitled run"}</p>
                <div className="flex flex-wrap gap-2">
                  <Link to={paths.run(run.id)}>
                    <Button size="sm" variant="secondary">
                      Run progress
                    </Button>
                  </Link>
                  <Link to={paths.workspaceThread(run.threadId)}>
                    <Button size="sm" variant="ghost">
                      Open conversation
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
