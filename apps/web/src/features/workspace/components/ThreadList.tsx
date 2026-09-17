import { Link } from "react-router-dom";
import type { Thread } from "../../../types/api.ts";
import { paths } from "../../../app/paths.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { timeAgo, truncate } from "../../../shared/lib/format.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { PlusIcon } from "../../../shared/icons/index.tsx";
import { SkeletonRows } from "../../../shared/ui/Skeleton.tsx";

export function ThreadList({
  threads,
  activeId,
  loading,
  onNew,
  creating,
}: {
  threads: Thread[];
  activeId: string | null;
  loading: boolean;
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Conversations</p>
        <Button size="sm" variant="secondary" onClick={onNew} loading={creating} icon={<PlusIcon className="size-3.5" />}>
          New
        </Button>
      </div>
      <div className="scroll-quiet flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : threads.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-500">No conversations yet. Start one to brief the Orchestrator.</p>
        ) : (
          <ul className="p-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  to={paths.workspaceThread(t.id)}
                  className={cn(
                    "block rounded-md px-3 py-2.5 transition-colors",
                    t.id === activeId ? "bg-ink-100" : "hover:bg-ink-50",
                  )}
                >
                  <p className={cn("truncate text-sm", t.id === activeId ? "font-semibold text-ink-900" : "font-medium text-ink-700")}>
                    {t.title ? truncate(t.title, 60) : "Untitled conversation"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">{timeAgo(t.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
