import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function KeyValueList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{item.label}</dt>
          <dd className="mt-0.5 truncate text-sm text-ink-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
