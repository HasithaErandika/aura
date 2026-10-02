import { Badge } from "@/shared/ui/Badge.tsx";
import { ciBadge, ciDetail } from "../lib/ci.ts";
import type { TaskPr } from "../types.ts";

export function CiStatus({ pr }: { pr: TaskPr }) {
  const ci = ciBadge(pr.ciState);
  const detail = ciDetail(pr);
  const badge = (
    <Badge tone={ci.tone} dot={pr.ciState === "running"}>
      {ci.label}
    </Badge>
  );
  return (
    <div className="flex flex-col items-start gap-1">
      {pr.ciUrl ? (
        <a href={pr.ciUrl} target="_blank" rel="noreferrer" className="rounded-md focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:outline-none">
          {badge}
          <span className="sr-only">(opens CI run in a new tab)</span>
        </a>
      ) : (
        badge
      )}
      {detail ? <span className="text-xs text-ink-500">{detail}</span> : null}
    </div>
  );
}
