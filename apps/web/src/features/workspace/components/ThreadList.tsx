import { useState } from "react";
import { ChatIcon, PlusIcon } from "@/shared/icons/index.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { SearchInput } from "@/shared/ui/SearchInput.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { threadTitle } from "../lib/threads.ts";
import type { Thread } from "../types.ts";
import { ThreadRow } from "./ThreadRow.tsx";

interface ThreadListProps {
  threads: Thread[];
  activeId: string | null;
  loading: boolean;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onOpen?: () => void;
}

export function ThreadList({ threads, activeId, loading, onNew, onRename, onDelete, onOpen }: ThreadListProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = query ? threads.filter((t) => threadTitle(t).toLowerCase().includes(query)) : threads;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <ChatIcon className="size-4 text-ink-500" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wider text-ink-600 uppercase">Conversations</h2>
          <Badge tone="outline">{threads.length}</Badge>
        </div>
        <Button size="sm" variant="primary" onClick={onNew} icon={<PlusIcon className="size-3.5" />}>
          New
        </Button>
      </div>
      {threads.length > 3 ? (
        <div className="border-b border-line bg-surface px-3 py-2">
          <SearchInput label="Search conversations" placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      ) : null}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <SkeletonRows rows={5} />
        ) : shown.length === 0 ? (
          <EmptyState title={query ? "No matching conversations" : "No conversations yet"} description={query ? "Try another search." : "Start one with New."} className="py-8" />
        ) : (
          <ul className="space-y-1 p-2">
            {shown.map((t) => (
              <li key={t.id}>
                <ThreadRow thread={t} active={t.id === activeId} onRename={onRename} onDelete={onDelete} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
