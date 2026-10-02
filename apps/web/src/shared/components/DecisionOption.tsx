import type { AskUserOption } from "../api/types.ts";
import { cn } from "../lib/cn.ts";

export function DecisionOption({ option, active, disabled, onSelect }: { option: AskUserOption; active: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 disabled:opacity-60",
        active ? "border-ink-900 bg-ink-900 text-on-dark" : "border-line-strong bg-surface text-ink-800 hover:bg-ink-50",
      )}
    >
      <span className="block font-medium">{option.label}</span>
      {option.description ? <span className={cn("mt-0.5 block text-xs", active ? "text-ink-300" : "text-ink-500")}>{option.description}</span> : null}
    </button>
  );
}
