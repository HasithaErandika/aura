import { LayersIcon } from "@/shared/icons/index.tsx";
import { cn } from "@/shared/lib/cn.ts";
import type { AsyncState } from "@/shared/hooks/useAsync.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { SearchInput } from "@/shared/ui/SearchInput.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { STATUS_TONE } from "../lib/tones.ts";
import type { JiraIssueSummary } from "../types.ts";

interface EpicListProps {
  state: AsyncState<JiraIssueSummary[]>;
  query: string;
  onQueryChange: (q: string) => void;
  selected: string | null;
  onSelect: (key: string) => void;
}

export function EpicList({ state, query, onQueryChange, selected, onSelect }: EpicListProps) {
  return (
    <>
      <div className="shrink-0 border-b border-line px-3 py-2.5">
        <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Epics</h2>
        <SearchInput label="Search Epics" value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search Epics" />
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5">
        <AsyncView
          state={state}
          loading={<SkeletonRows rows={3} />}
          errorClassName="m-1.5"
          isEmpty={(epics) => epics.length === 0}
          empty={<EmptyState icon={<LayersIcon className="size-5" />} title="No Epics found" description={query ? "Try a different search." : "No Epics exist in this Jira project yet."} className="py-10" />}
        >
          {(epics) => (
            <ul className="space-y-0.5 text-sm">
              {epics.map((epic) => {
                const active = selected === epic.key;
                return (
                  <li key={epic.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(epic.key)}
                      aria-current={active ? "true" : undefined}
                      className={cn("flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:outline-none", active ? "bg-brand-soft" : "hover:bg-ink-100")}
                    >
                      <span className="flex items-center gap-1.5">
                        <LayersIcon className={cn("size-3.5 shrink-0", active ? "text-brand" : "text-ink-400")} aria-hidden />
                        <span className={cn("truncate font-mono text-xs font-semibold", active ? "text-brand" : "text-ink-800")}>{epic.key}</span>
                        <Badge tone={STATUS_TONE[epic.statusCategory]} className="ml-auto">
                          {epic.status}
                        </Badge>
                      </span>
                      <span className={cn("truncate text-xs", active ? "text-brand/80" : "text-ink-500")}>{epic.summary || "(no summary)"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncView>
      </div>
    </>
  );
}
