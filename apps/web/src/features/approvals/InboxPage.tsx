import { useMemo, useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { approvalsApi } from "./api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Tabs } from "../../shared/ui/Tabs.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { ClipboardCheckIcon } from "../../shared/icons/index.tsx";
import { ApprovalSummary } from "./components/ApprovalSummary.tsx";
import { useAuth } from "../../shared/auth/useAuth.ts";

type Tab = "mine" | "pending" | "history";

export function InboxPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("mine");
  const state = useAsync(() => approvalsApi.list(), []);
  usePolling(state.reload, 15_000, true);

  const groups = useMemo(() => {
    const all = state.data ?? [];
    const pending = all.filter((a) => a.status === "PENDING");
    return {
      mine: pending.filter((a) => a.canDecide),
      pending,
      history: all.filter((a) => a.status !== "PENDING"),
    };
  }, [state.data]);

  const items = groups[tab];

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
      <Card>
        <div className="px-5 pt-1">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "mine", label: "Needs my decision", count: groups.mine.length },
              { value: "pending", label: "All pending", count: groups.pending.length },
              { value: "history", label: "History", count: groups.history.length },
            ]}
          />
        </div>
        {state.loading && !state.data ? (
          <SkeletonRows rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheckIcon className="size-5" />}
            title={tab === "mine" ? "Nothing needs your decision" : tab === "pending" ? "No pending gates" : "No decisions recorded yet"}
            description={tab === "history" ? "Approvals, rejections, and answers will appear here with who decided and when." : "When an agent pauses for a human, the request shows up here."}
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((a) => (
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
