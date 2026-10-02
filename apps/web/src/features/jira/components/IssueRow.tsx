import { useId, useState, type ComponentType, type SVGProps } from "react";
import { ChevronRightIcon } from "@/shared/icons/index.tsx";
import { cn } from "@/shared/lib/cn.ts";
import { truncate } from "@/shared/lib/format.ts";
import { Badge } from "@/shared/ui/Badge.tsx";
import { priorityTone, STATUS_TONE } from "../lib/tones.ts";
import type { JiraIssueSummary } from "../types.ts";
import { IssueDetailPanel } from "./IssueDetailPanel.tsx";

export type IssueIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function IssueRow({ issue, icon: Icon, onChanged }: { issue: JiraIssueSummary; icon: IssueIcon; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Pick<JiraIssueSummary, "status" | "statusCategory"> | null>(null);
  const panelId = useId();
  const current = status ?? issue;

  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none">
        <Icon className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="shrink-0 font-mono text-xs font-semibold text-ink-500">{issue.key}</span>
        <span className="min-w-0 flex-1 truncate text-ink-800">{issue.summary || "(no summary)"}</span>
        {issue.priority ? (
          <Badge tone={priorityTone(issue.priority)} className="hidden sm:inline-flex">
            {issue.priority}
          </Badge>
        ) : null}
        {issue.assignee ? <span className="hidden shrink-0 text-xs text-ink-400 md:inline">{truncate(issue.assignee, 18)}</span> : null}
        <Badge tone={STATUS_TONE[current.statusCategory]}>{current.status}</Badge>
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-ink-400 transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId}>
          <IssueDetailPanel
            issueKey={issue.key}
            issueType={issue.issueType}
            onMoved={(updated) => {
              setStatus({ status: updated.status, statusCategory: updated.statusCategory });
              onChanged();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}
