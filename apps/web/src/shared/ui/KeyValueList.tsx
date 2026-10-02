import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export interface KeyValueItem {
  label: string;
  value: ReactNode;
}

export function KeyValueList({ items, columns = 2, className }: { items: KeyValueItem[]; columns?: 1 | 2; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", columns === 2 && "sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
