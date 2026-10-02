import { useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { EditIcon, TrashIcon } from "@/shared/icons/index.tsx";
import { cn } from "@/shared/lib/cn.ts";
import { timeAgo } from "@/shared/lib/format.ts";
import { IconButton } from "@/shared/ui/IconButton.tsx";
import { threadTitle } from "../lib/threads.ts";
import type { Thread } from "../types.ts";
import { ThreadTitleEditor } from "./ThreadTitleEditor.tsx";

interface ThreadRowProps {
  thread: Thread;
  active: boolean;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onOpen?: () => void;
}

export function ThreadRow({ thread, active, onRename, onDelete, onOpen }: ThreadRowProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = threadTitle(thread);

  async function remove() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(thread.id);
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-line bg-surface p-1.5">
        <ThreadTitleEditor initial={title} onCancel={() => setEditing(false)} onSave={async (t) => setEditing(!(await onRename(thread.id, t)))} />
      </div>
    );
  }

  return (
    <div className={cn("group flex items-center gap-1 rounded-lg pr-1 transition-colors", active ? "border border-line bg-surface shadow-xs" : "hover:bg-surface")}>
      <Link to={paths.workspaceThread(thread.id)} onClick={onOpen} aria-current={active ? "page" : undefined} className="min-w-0 flex-1 px-3 py-2.5 focus-visible:outline-none">
        <span className={cn("block truncate text-xs", active ? "font-semibold text-ink-900" : "font-medium text-ink-700")}>{title}</span>
        <span className="mt-0.5 block text-[10px] text-ink-400">{timeAgo(thread.updatedAt)}</span>
      </Link>
      <div className="flex shrink-0 items-center lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <IconButton label={`Rename ${title}`} onClick={() => setEditing(true)} icon={<EditIcon className="size-3.5" />} />
        <IconButton label={`Delete ${title}`} tone="danger" disabled={deleting} onClick={() => void remove()} icon={<TrashIcon className="size-3.5" />} />
      </div>
    </div>
  );
}
