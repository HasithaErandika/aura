import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import type { Run } from "@/shared/api/types.ts";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { ListIcon } from "@/shared/icons/index.tsx";
import { timeAgo, truncate } from "@/shared/lib/format.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";

export function RecentRunsCard({ runs, loading, emptyHint }: { runs: Run[] | null; loading: boolean; emptyHint?: string }) {
  return (
    <Section
      title="Recent runs"
      actions={
        <Link to={paths.runs} className="text-xs font-medium text-ink-600 hover:text-ink-900">
          All runs
        </Link>
      }
    >
      {loading && !runs ? (
        <SkeletonRows rows={4} />
      ) : !runs?.length ? (
        <EmptyState icon={<ListIcon className="size-5" />} title="No runs yet" description={emptyHint} />
      ) : (
        <ul className="divide-y divide-line">
          {runs.map((run) => (
            <li key={run.id}>
              <Link to={paths.run(run.id)} className="block px-4 py-3 hover:bg-ink-50 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-ink-900">{run.title ? truncate(run.title, 60) : "Untitled run"}</p>
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
    </Section>
  );
}
