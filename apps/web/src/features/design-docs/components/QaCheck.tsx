import { Badge } from "@/shared/ui/Badge.tsx";
import { qaBadge, qaDetail } from "../lib/ci.ts";
import type { TaskPr } from "../types.ts";

export function QaCheck({ pr }: { pr: TaskPr }) {
  const qa = qaBadge(pr.qaState);
  const detail = qaDetail(pr);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={qa.tone}>{qa.label}</Badge>
      {detail ? <span className="text-xs text-ink-500">{detail}</span> : null}
    </div>
  );
}
