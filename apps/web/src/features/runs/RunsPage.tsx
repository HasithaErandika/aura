import { useMemo, useState } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { ListIcon } from "@/shared/icons/index.tsx";
import { isRunActive } from "@/shared/lib/status.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { Tabs } from "@/shared/ui/Tabs.tsx";
import { runsApi } from "./api.ts";
import { RunsTable } from "./components/RunsTable.tsx";

type Filter = "all" | "active";

export function RunsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const state = useAsync(() => runsApi.list(), []);
  usePolling(state.reload, 15_000, true);

  const all = useMemo(() => state.data ?? [], [state.data]);
  const active = useMemo(() => all.filter((r) => isRunActive(r.status)), [all]);
  const shown = filter === "active" ? active : all;

  return (
    <>
      <PageHeader title="Runs" description="Every agent turn, the agents it involved and where it paused for a person." />
      <Card>
        <div className="px-4 pt-1 sm:px-5">
          <Tabs
            label="Run filter"
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "All", count: all.length },
              { value: "active", label: "Active", count: active.length },
            ]}
          />
        </div>
        <AsyncView state={state} loading={<SkeletonRows rows={5} />} errorClassName="m-4">
          {() =>
            shown.length === 0 ? (
              <EmptyState icon={<ListIcon className="size-5" />} title={filter === "active" ? "No active runs" : "No runs yet"} description="A run starts when someone sends a message to an agent." />
            ) : (
              <RunsTable runs={shown} />
            )
          }
        </AsyncView>
      </Card>
    </>
  );
}
