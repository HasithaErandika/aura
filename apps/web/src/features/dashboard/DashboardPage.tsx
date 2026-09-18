import { Link } from "react-router-dom";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { dashboardApi } from "./api.ts";
import { paths } from "../../app/paths.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Stat } from "../../shared/ui/Stat.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { RunStatusPill } from "../../shared/ui/StatusPill.tsx";
import { ApprovalSummary } from "../approvals/components/ApprovalSummary.tsx";
import { ChatIcon, ClipboardCheckIcon, ListIcon } from "../../shared/icons/index.tsx";
import { timeAgo, truncate } from "../../shared/lib/format.ts";
import { roleLabel } from "../../shared/lib/roles.ts";

export function DashboardPage() {
  const { profile } = useAuth();
  const state = useAsync(() => dashboardApi.summary(), []);
  usePolling(state.reload, 20_000, true);

  const summary = state.data;
  const canRun = profile ? Object.values(profile.grants.agents).includes("run") : false;
  const approves = profile?.grants.approves ?? [];
  const firstName = profile?.fullName?.split(" ")[0] ?? profile?.email ?? "";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          canRun
            ? `You are signed in as ${profile?.roleLabel}. ${approves.length ? `You sign off on ${approves.map((a) => a.replace(/-agent$/, "").toUpperCase()).join(" and ")} agent output.` : ""}`
            : `You are signed in as ${profile?.roleLabel}. Your role's agents arrive in a later phase.`
        }
        actions={
          canRun ? (
            <Link to={paths.workspace}>
              <Button variant="primary" icon={<ChatIcon className="size-4" />}>
                Open workspace
              </Button>
            </Link>
          ) : null
        }
      />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {summary && !summary.runtime.ok ? (
        <Alert tone="warning" title="Agent runtime is offline">
          {summary.runtime.message ?? "The API cannot reach apps/agent-runtime. Conversations will fail until it is back."}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={profile?.role === "admin" ? "Pending gates" : "Needs my decision"} value={summary ? summary.counts.pendingForMyRole : "–"} hint="Human gates waiting" />
        <Stat label="Active runs" value={summary ? summary.counts.activeRuns : "–"} hint="Running or queued" />
        <Stat label="Waiting on a person" value={summary ? summary.counts.suspendedRuns : "–"} hint="Suspended for approval" />
        <Stat label="Completed" value={summary ? summary.counts.succeededRuns : "–"} hint={summary ? `${summary.counts.failedRuns} failed or expired` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Needs a decision"
            description="Gates the Orchestrator is waiting on."
            actions={
              <Link to={paths.approvals} className="text-xs font-medium text-ink-600 hover:text-ink-900">
                Open inbox
              </Link>
            }
          />
          {state.loading && !summary ? (
            <SkeletonRows rows={3} />
          ) : !summary || summary.needsDecision.length === 0 ? (
            <EmptyState icon={<ClipboardCheckIcon className="size-5" />} title="No pending decisions" description="When an agent pauses for a human, the request appears here." />
          ) : (
            <ul className="divide-y divide-line">
              {summary.needsDecision.map((a) => (
                <li key={a.id}>
                  <ApprovalSummary approval={a} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent runs"
            actions={
              <Link to={paths.runs} className="text-xs font-medium text-ink-600 hover:text-ink-900">
                All runs
              </Link>
            }
          />
          {state.loading && !summary ? (
            <SkeletonRows rows={4} />
          ) : !summary || summary.recentRuns.length === 0 ? (
            <EmptyState icon={<ListIcon className="size-5" />} title="No runs yet" description={canRun ? "Start a conversation in the workspace to create one." : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {summary.recentRuns.map((run) => (
                <li key={run.id}>
                  <Link to={paths.run(run.id)} className="block px-5 py-3 hover:bg-ink-50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink-900">{run.title ? truncate(run.title, 60) : "Untitled run"}</p>
                      <RunStatusPill status={run.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {run.requester?.fullName ?? roleLabel(run.requestedByRole)} · {timeAgo(run.startedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {summary ? (
        <Card>
          <CardHeader title="Your grants" description="Authorization is evaluated in the API from these tables, never by an agent." />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.grants.agents).length === 0 ? (
                <p className="text-sm text-ink-500">No agent grants for this role in Phase 1.</p>
              ) : (
                Object.entries(summary.grants.agents).map(([agent, access]) => (
                  <span key={agent} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-1 text-xs">
                    <span className="font-semibold text-ink-800">{agent}</span>
                    <span className="text-ink-500">{access === "run" ? "run" : "read only"}</span>
                  </span>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
