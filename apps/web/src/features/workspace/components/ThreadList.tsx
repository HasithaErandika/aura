import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { Thread } from "../../../types/api.ts";
import { paths } from "../../../app/paths.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { timeAgo, truncate } from "../../../shared/lib/format.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { PlusIcon, EditIcon, TrashIcon, SearchIcon, CheckIcon, XIcon, ChatIcon } from "../../../shared/icons/index.tsx";
import { SkeletonRows } from "../../../shared/ui/Skeleton.tsx";

export function ThreadList({
  threads,
  activeId,
  loading,
  onNew,
  creating,
  onRename,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  loading: boolean;
  onNew: () => void;
  creating: boolean;
  onRename?: (threadId: string, newTitle: string) => Promise<void>;
  onDelete?: (threadId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredThreads = threads.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (t.title ?? "Untitled conversation").toLowerCase().includes(q);
  });

  function startEditing(e: MouseEvent, thread: Thread) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(thread.id);
    setEditTitle(thread.title ?? "Untitled conversation");
  }

  async function saveTitle(threadId: string) {
    if (!onRename || !editTitle.trim() || saving) return;
    setSaving(true);
    try {
      await onRename(threadId, editTitle.trim());
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, threadId: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveTitle(threadId);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  async function handleDelete(e: MouseEvent, threadId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!onDelete || deletingId) return;
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;
    setDeletingId(threadId);
    try {
      await onDelete(threadId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-subtle">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface">
        <div className="flex items-center gap-2">
          <ChatIcon className="size-4 text-ink-500" />
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">Chats</p>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
            {threads.length}
          </span>
        </div>
        <Button size="sm" variant="primary" onClick={onNew} loading={creating} icon={<PlusIcon className="size-3.5" />}>
          New Chat
        </Button>
      </div>

      {threads.length > 3 ? (
        <div className="border-b border-line px-3 py-2 bg-surface">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-md border border-line bg-surface-subtle pl-8 pr-3 py-1.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-ink-500 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      <div className="scroll-quiet flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : filteredThreads.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs font-medium text-ink-500">
              {search ? "No matching conversations" : "No conversations yet"}
            </p>
            <p className="mt-1 text-[11px] text-ink-400">
              {search ? "Try a different search term" : "Click 'New Chat' to start briefing"}
            </p>
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {filteredThreads.map((t) => {
              const isActive = t.id === activeId;
              const isEditing = t.id === editingId;
              return (
                <li key={t.id} className="group relative">
                  {isEditing ? (
                    <div className="flex items-center gap-1 rounded-lg border border-ink-400 bg-surface p-1.5 shadow-sm">
                      <input
                        type="text"
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, t.id)}
                        className="w-full bg-transparent px-2 py-1 text-xs text-ink-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void saveTitle(t.id)}
                        disabled={saving}
                        title="Save title"
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <CheckIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        className="rounded p-1 text-ink-400 hover:bg-ink-100"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Link
                      to={paths.workspaceThread(t.id)}
                      className={cn(
                        "group/link flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-150",
                        isActive
                          ? "bg-surface shadow-xs border border-line text-ink-900 font-semibold"
                          : "text-ink-700 hover:bg-surface hover:text-ink-900",
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className={cn("truncate text-xs leading-snug", isActive ? "font-semibold text-ink-900" : "font-medium text-ink-700")}>
                          {t.title ? truncate(t.title, 48) : "Untitled Chat"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-400">{timeAgo(t.updatedAt)}</p>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/link:opacity-100">
                        {onRename ? (
                          <button
                            type="button"
                            onClick={(e) => startEditing(e, t)}
                            title="Rename chat"
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                          >
                            <EditIcon className="size-3.5" />
                          </button>
                        ) : null}
                        {onDelete ? (
                          <button
                            type="button"
                            onClick={(e) => void handleDelete(e, t.id)}
                            disabled={deletingId === t.id}
                            title="Delete conversation"
                            className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
