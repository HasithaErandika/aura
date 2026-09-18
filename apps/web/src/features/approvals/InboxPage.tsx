import { useMemo } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { approvalsApi } from "./api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Stat } from "../../shared/ui/Stat.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { ClipboardCheckIcon } from "../../shared/icons/index.tsx";
import { ApprovalSummary } from "./components/ApprovalSummary.tsx";
import { useAuth } from "../../shared/auth/useAuth.ts";

// One unified, live feed - every gate, pending or already decided, newest first. No tabs: each
// row already carries its own status pill and, when it applies, a "Your decision" badge
// (ApprovalSummary), so splitting the same data across "All pending" / "Needs my decision" /
// "History" views was separating what a single glance down the list already tells you.
export function InboxPage() {
  const { profile } = useAuth();
  const state = useAsync(() => approvalsApi.list(), []);
  usePolling(state.reload, 15_000, true);

  const approvals = state.data ?? [];
  const counts = useMemo(() => {
    const pending = approvals.filter((a) => a.status === "PENDING");
    return { pending: pending.length, mine: pending.filter((a) => a.canDecide).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  return (
    <>
      <PageHeader
        title="Approval Inbox"
        description={
          profile?.role === "admin"
            ? "Every human gate across the platform. Admins can watch but not decide on behalf of an approver."
            : "Decisions the Orchestrator is waiting on. Nothing is filed in Jira until a human here says so."
        }
      />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Pending" value={state.data ? counts.pending : "–"} hint="Awaiting a decision" />
        <Stat label="Needs your decision" value={state.data ? counts.mine : "–"} hint="Only you (or your role) can act" />
        <div className="hidden sm:block">
          <Stat label="Total shown" value={state.data ? approvals.length : "–"} hint="Pending and already decided" />
        </div>
      </div>

      <Card>
        {state.loading && !state.data ? (
          <SkeletonRows rows={5} />
        ) : approvals.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheckIcon className="size-5" />}
            title="Nothing here yet"
            description="When an agent pauses for a human, the request shows up here - and stays, with its outcome, once decided."
          />
        ) : (
          <ul className="divide-y divide-line">
            {approvals.map((a) => (
              <li key={a.id}>
                <ApprovalSummary approval={a} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
