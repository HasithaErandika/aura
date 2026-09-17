import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { runsApi } from "./api.ts";
import { paths } from "../../app/paths.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Tabs } from "../../shared/ui/Tabs.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { Table, TBody, TD, TH, THead, TR } from "../../shared/ui/Table.tsx";
import { RunStatusPill } from "../../shared/ui/StatusPill.tsx";
import { ListIcon } from "../../shared/icons/index.tsx";
import { duration, formatDateTime, truncate } from "../../shared/lib/format.ts";
import { roleLabel } from "../../shared/lib/roles.ts";
import type { RunStatus } from "../../types/api.ts";

type Tab = "active" | "all";
const ACTIVE: RunStatus[] = ["PENDING", "RUNNING", "SUSPENDED_FOR_APPROVAL"];

export function RunsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const state = useAsync(() => runsApi.list(), []);
  usePolling(state.reload, 15_000, true);

  const runs = useMemo(() => {
    const all = state.data ?? [];
    return tab === "active" ? all.filter((r) => ACTIVE.includes(r.status)) : all;
  }, [state.data, tab]);

  return (
    <>
      <PageHeader title="Runs" description="Every agent turn the Orchestrator has executed, with the agents it involved and where it paused for a human." />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Card>
        <div className="px-5 pt-1">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "active", label: "Active", count: (state.data ?? []).filter((r) => ACTIVE.includes(r.status)).length },
              { value: "all", label: "All", count: (state.data ?? []).length },
            ]}
          />
        </div>
        {state.loading && !state.data ? (
          <SkeletonRows rows={5} />
        ) : runs.length === 0 ? (
          <EmptyState icon={<ListIcon className="size-5" />} title={tab === "active" ? "No active runs" : "No runs yet"} description="Runs are created when someone sends a message in the Agent Workspace." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Request</TH>
                <TH>Status</TH>
                <TH>Agents</TH>
                <TH>Requested by</TH>
                <TH>Started</TH>
                <TH>Duration</TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((run) => (
                <TR key={run.id} className="hover:bg-ink-50">
                  <TD>
                    <Link to={paths.run(run.id)} className="font-medium text-ink-900 hover:underline">
                      {run.title ? truncate(run.title, 80) : "Untitled run"}
                    </Link>
                  </TD>
                  <TD>
                    <RunStatusPill status={run.status} />
                  </TD>
                  <TD className="text-xs text-ink-600">{run.agentsInvolved.length ? run.agentsInvolved.map((a) => a.replace(/-agent$/, "").toUpperCase()).join(", ") : "Orchestrator"}</TD>
                  <TD>
                    <span className="block text-sm text-ink-800">{run.requester?.fullName ?? run.requester?.email ?? ""}</span>
                    <span className="block text-xs text-ink-500">{roleLabel(run.requestedByRole)}</span>
                  </TD>
                  <TD className="text-xs text-ink-600">{formatDateTime(run.startedAt)}</TD>
                  <TD className="text-xs text-ink-600 tabular-nums">{duration(run.startedAt, run.finishedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
