import { useState } from "react";
import { paths } from "@/app/paths.ts";
import type { RunStatus } from "@/shared/api/types.ts";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { AgentLiveIcon, EditIcon, ListIcon } from "@/shared/icons/index.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { IconButton } from "@/shared/ui/IconButton.tsx";
import { LinkButton } from "@/shared/ui/LinkButton.tsx";
import { ThreadTitleEditor } from "./ThreadTitleEditor.tsx";

interface WorkspaceHeaderProps {
  title: string;
  description: string | null;
  busy: boolean;
  runStatus: RunStatus | null;
  runId: string | null;
  onRename: ((title: string) => Promise<boolean>) | null;
  onShowThreads: () => void;
}

export function WorkspaceHeader({ title, description, busy, runStatus, runId, onRename, onShowThreads }: WorkspaceHeaderProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <AgentLiveIcon running={busy} size={28} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {editing && onRename ? (
              <ThreadTitleEditor initial={title} onCancel={() => setEditing(false)} onSave={async (t) => setEditing(!(await onRename(t)))} />
            ) : (
              <>
                <h1 className="truncate text-sm font-semibold text-ink-900">{title}</h1>
                {onRename ? <IconButton label="Rename conversation" onClick={() => setEditing(true)} icon={<EditIcon className="size-3.5" />} /> : null}
              </>
            )}
            {runStatus ? <RunStatusPill status={runStatus} /> : null}
          </div>
          {description ? <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{description}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {runId ? (
          <LinkButton size="sm" to={paths.run(runId)}>
            Run details
          </LinkButton>
        ) : null}
        <Button size="sm" className="lg:hidden" onClick={onShowThreads} icon={<ListIcon className="size-3.5" />}>
          Conversations
        </Button>
      </div>
    </div>
  );
}
