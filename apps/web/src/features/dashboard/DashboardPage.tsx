import { useProfile } from "@/shared/auth/useAuth.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { ChatIcon } from "@/shared/icons/index.tsx";
import { paths } from "@/app/paths.ts";
import { canUseWorkspace, isAdmin } from "@/shared/lib/access.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { ErrorAlert } from "@/shared/ui/ErrorAlert.tsx";
import { LinkButton } from "@/shared/ui/LinkButton.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { dashboardApi } from "./api.ts";
import { DashboardStats } from "./components/DashboardStats.tsx";
import { GrantsCard } from "./components/GrantsCard.tsx";
import { NeedsDecisionCard } from "./components/NeedsDecisionCard.tsx";
import { RecentRunsCard } from "./components/RecentRunsCard.tsx";
import { firstName, roleSummary } from "./lib/greeting.ts";

export function DashboardPage() {
  const me = useProfile();
  const state = useAsync(() => dashboardApi.summary(), []);
  usePolling(state.reload, 20_000, true);
  const summary = state.data;
  const workspace = canUseWorkspace(me);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName(me)}`}
        description={roleSummary(me)}
        actions={
          workspace ? (
            <LinkButton to={paths.workspace} variant="primary" icon={<ChatIcon className="size-4" aria-hidden />}>
              Open workspace
            </LinkButton>
          ) : null
        }
      />

      {state.error ? <ErrorAlert error={state.error} onRetry={() => void state.reload()} /> : null}
      {summary && !summary.runtime.ok ? (
        <Alert tone="warning" title="Agent runtime is offline">
          {summary.runtime.message ?? "The API cannot reach the agent runtime. Conversations fail until it is back."}
        </Alert>
      ) : null}

      <DashboardStats counts={summary?.counts ?? null} isAdmin={isAdmin(me)} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <NeedsDecisionCard approvals={summary?.needsDecision ?? null} loading={state.loading} />
        <RecentRunsCard runs={summary?.recentRuns ?? null} loading={state.loading} emptyHint={workspace ? "Start a conversation in the workspace to create one." : undefined} />
      </div>

      {summary ? <GrantsCard grants={summary.grants} /> : null}
    </>
  );
}
