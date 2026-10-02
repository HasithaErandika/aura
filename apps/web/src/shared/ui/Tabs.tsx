import { cn } from "../lib/cn.ts";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: Array<TabItem<T>>; label?: string }) {
  return (
    <div className="scroll-quiet flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label={label}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className={cn("rounded-md px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-ink-900 text-on-dark" : "bg-neutral-soft text-ink-600")}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
