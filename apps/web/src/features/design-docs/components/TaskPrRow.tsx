import { cn } from "@/shared/lib/cn.ts";
import { timeAgo } from "@/shared/lib/format.ts";
import { ExternalLink } from "@/shared/ui/ExternalLink.tsx";
import { TD, TR } from "@/shared/ui/Table.tsx";
import type { TaskPr } from "../types.ts";
import { CiStatus } from "./CiStatus.tsx";

export function TaskPrRow({ pr, focused }: { pr: TaskPr; focused: boolean }) {
  return (
    <TR className={cn(focused && "bg-brand-soft")}>
      <TD className="font-semibold text-ink-900">{pr.taskKey}</TD>
      <TD>
        {pr.prUrl ? (
          <ExternalLink href={pr.prUrl} className="text-sm text-brand">
            #{pr.prNumber} {pr.prTitle ?? ""}
          </ExternalLink>
        ) : (
          <span className="text-ink-500">Branch {pr.branch} pushed, no pull request yet</span>
        )}
      </TD>
      <TD>
        <CiStatus pr={pr} />
      </TD>
      <TD className="text-xs text-ink-600">{pr.reviewers.length ? pr.reviewers.join(", ") : "None"}</TD>
      <TD className="text-xs text-ink-500">{timeAgo(pr.ciUpdatedAt ?? pr.updatedAt)}</TD>
    </TR>
  );
}
