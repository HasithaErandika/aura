import { cn } from "@/shared/lib/cn.ts";
import { formatDateTime } from "@/shared/lib/format.ts";
import type { StateTone } from "@/shared/lib/tone.ts";
import { CodeBlock } from "@/shared/ui/CodeBlock.tsx";
import { Disclosure } from "@/shared/ui/Disclosure.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { buildTimeline } from "../lib/timeline.ts";
import type { RunStep } from "../types.ts";

const DOT: Record<StateTone, string> = {
  neutral: "bg-ink-300",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function RunTimeline({ steps }: { steps: RunStep[] }) {
  const entries = buildTimeline(steps);
  if (entries.length === 0) return <EmptyState title="No steps recorded yet" className="py-8" />;

  return (
    <ol className="px-4 py-2 sm:px-5">
      {entries.map((entry, idx) => (
        <li key={entry.id} className="relative flex gap-4 py-3">
          {idx < entries.length - 1 ? <span className="absolute top-7 bottom-0 left-[5px] w-px bg-line" aria-hidden /> : null}
          <span className={cn("mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", DOT[entry.tone])} aria-hidden />
          <Disclosure
            className="min-w-0 flex-1"
            summary={
              <>
                <span className="block text-sm font-medium break-words text-ink-900">{entry.title}</span>
                <span className="block text-xs text-ink-500">{formatDateTime(entry.createdAt)}</span>
              </>
            }
          >
            {entry.detail ? <CodeBlock className="mt-2">{entry.detail}</CodeBlock> : null}
          </Disclosure>
        </li>
      ))}
    </ol>
  );
}
