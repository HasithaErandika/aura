import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronRightIcon } from "../icons/index.tsx";

export function Disclosure({ summary, children, disabled, className }: { summary: ReactNode; children?: ReactNode; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const expandable = !disabled && children !== undefined && children !== null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? panelId : undefined}
        className={cn("flex w-full items-center gap-2 text-left", expandable ? "cursor-pointer" : "cursor-default")}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        {expandable ? <ChevronRightIcon className={cn("size-4 shrink-0 text-ink-400 transition-transform", open && "rotate-90")} aria-hidden /> : null}
      </button>
      {expandable && open ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
