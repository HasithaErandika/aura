import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Chip({ children, title, mono, className }: { children: ReactNode; title?: string; mono?: boolean; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-line bg-ink-50 px-2 py-0.5 text-[11px] text-ink-700", mono && "font-mono", className)}>
      {children}
    </span>
  );
}
