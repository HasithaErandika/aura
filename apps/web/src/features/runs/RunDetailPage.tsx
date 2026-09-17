import { Link, useParams } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { runsApi } from "./api.ts";
import { paths } from "../../app/paths.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { KeyValueList } from "../../shared/ui/KeyValue.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { RunStatusPill } from "../../shared/ui/StatusPill.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { RunTimeline } from "./components/RunTimeline.tsx";
import { ApprovalSummary } from "../approvals/components/ApprovalSummary.tsx";
import { duration, formatDateTime } from "../../shared/lib/format.ts";
import { roleLabel } from "../../shared/lib/roles.ts";
import { ArrowLeftIcon } from "../../shared/icons/index.tsx";

export function RunDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const state = useAsync(() => runsApi.get(id), [id]);
  const active = state.data ? ["PENDING", "RUNNING", "SUSPENDED_FOR_APPROVAL"].includes(state.data.run.status) : false;
  usePolling(state.reload, 5000, active);

  if (state.loading && !state.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading run" />
      </div>
    );
  }
  if (state.error || !state.data) return <Alert tone="danger">{state.error ?? "Run not found"}</Alert>;

  const { run, steps, approvals } = state.data;

  return (
    <>
      <div>
        <Link to={paths.runs} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeftIcon className="size-3.5" />
          Back to runs
        </Link>
      </div>
      <PageHeader
        title={run.title ?? "Untitled run"}
        description={`Started ${formatDateTime(run.startedAt)} by ${run.requester?.fullName ?? run.requester?.email ?? "unknown"} (${roleLabel(run.requestedByRole)})`}
        actions={
          <>
            <RunStatusPill status={run.status} />
            <Link to={paths.workspaceThread(run.threadId)}>
              <Button size="sm" variant="secondary">
                Open conversation
              </Button>
            </Link>
          </>
        }
      />

      {run.lastError ? (
        <Alert tone="danger" title="Last error">
          {run.lastError}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress" description="What the Orchestrator did, in the order it decided to do it." />
            <RunTimeline steps={steps} />
          </Card>

          {approvals.length > 0 ? (
            <Card>
              <CardHeader title="Human decisions" description="Every time this run paused for a person." />
              <ul className="divide-y divide-line">
                {approvals.map((a) => (
                  <li key={a.id}>
                    <ApprovalSummary approval={a} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {run.outputSummary ? (
            <Card>
              <CardHeader title="Final response" />
              <CardBody>
                <Markdown source={run.outputSummary} className="text-sm text-ink-800" />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <KeyValueList
                className="sm:grid-cols-1"
                items={[
                  { label: "Entry agent", value: run.agentId },
                  { label: "Agents involved", value: run.agentsInvolved.length ? run.agentsInvolved.join(", ") : "none yet" },
                  { label: "Current agent", value: run.currentAgent ?? "Orchestrator" },
                  { label: "Duration", value: duration(run.startedAt, run.finishedAt) },
                  { label: "Finished", value: run.finishedAt ? formatDateTime(run.finishedAt) : "in progress" },
                  { label: "Runtime run id", value: <span className="font-mono text-xs">{run.runtimeRunId ?? "not assigned"}</span> },
                  { label: "Run id", value: <span className="font-mono text-xs">{run.id}</span> },
                ]}
              />
            </CardBody>
          </Card>
          {run.inputSummary ? (
            <Card>
              <CardHeader title="Request" />
              <CardBody>
                <p className="text-sm text-ink-800 whitespace-pre-wrap">{run.inputSummary}</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
