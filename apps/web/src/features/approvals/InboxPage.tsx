import { useProfile } from "@/shared/auth/useAuth.ts";
import { ApprovalRow } from "@/shared/components/ApprovalRow.tsx";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { ClipboardCheckIcon } from "@/shared/icons/index.tsx";
import { isAdmin } from "@/shared/lib/access.ts";
import { countPending } from "@/shared/lib/approvals.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { Stat } from "@/shared/ui/Stat.tsx";
import { StatGrid } from "@/shared/ui/StatGrid.tsx";
import { approvalsApi } from "./api.ts";

export function InboxPage() {
  const me = useProfile();
  const state = useAsync(() => approvalsApi.list(), []);
  usePolling(state.reload, 15_000, true);
  const approvals = state.data;
  const counts = approvals ? countPending(approvals) : null;

  return (
    <>
      <PageHeader
        title="Approval Inbox"
        description={
          isAdmin(me)
            ? "Every human gate across the platform. Admins can watch but never decide for an approver."
            : "Decisions the agents are waiting on. Nothing is filed in Jira until a person here says so."
        }
      />

      <StatGrid cols={3}>
        <Stat label="Pending" value={counts?.pending ?? "-"} hint="Awaiting a decision" />
        <Stat label="Needs your decision" value={counts?.mine ?? "-"} hint="Only you or your role can act" />
        <Stat label="Total shown" value={approvals?.length ?? "-"} hint="Pending and already decided" />
      </StatGrid>

      <AsyncView
        state={state}
        loading={
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        }
      >
        {(list) => (
          <Card>
            {list.length === 0 ? (
              <EmptyState icon={<ClipboardCheckIcon className="size-5" />} title="Nothing here yet" description="When an agent pauses for a person, the request shows up here and stays, with its outcome, once decided." />
            ) : (
              <ul className="divide-y divide-line">
                {list.map((a) => (
                  <li key={a.id}>
                    <ApprovalRow approval={a} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </AsyncView>
    </>
  );
}
