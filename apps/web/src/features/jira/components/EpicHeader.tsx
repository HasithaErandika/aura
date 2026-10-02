import { LayersIcon, PersonIcon } from "@/shared/icons/index.tsx";
import { timeAgo } from "@/shared/lib/format.ts";
import { Badge } from "@/shared/ui/Badge.tsx";
import { ExternalLink } from "@/shared/ui/ExternalLink.tsx";
import { priorityTone, STATUS_TONE } from "../lib/tones.ts";
import type { JiraIssueDetail } from "../types.ts";

export function EpicHeader({ epic }: { epic: JiraIssueDetail }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          <LayersIcon className="size-3" aria-hidden /> Epic
        </Badge>
        <span className="font-mono text-xs font-semibold text-ink-500">{epic.key}</span>
        <Badge tone={STATUS_TONE[epic.statusCategory]}>{epic.status}</Badge>
        {epic.priority ? <Badge tone={priorityTone(epic.priority)}>{epic.priority}</Badge> : null}
        {epic.url ? (
          <ExternalLink href={epic.url} className="sm:ml-auto">
            Open in Jira
          </ExternalLink>
        ) : null}
      </div>
      <h2 className="text-base font-semibold break-words text-ink-900">{epic.summary || "(no summary)"}</h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
        {epic.assignee ? (
          <span className="inline-flex items-center gap-1">
            <PersonIcon className="size-3.5" aria-hidden /> {epic.assignee}
          </span>
        ) : null}
        {epic.updated ? <span>Updated {timeAgo(epic.updated)}</span> : null}
      </div>
      {epic.description ? <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink-700">{epic.description}</p> : null}
    </div>
  );
}
