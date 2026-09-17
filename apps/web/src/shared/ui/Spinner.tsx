import { cn } from "../lib/cn.ts";

export function Spinner({ size = "md", label, className }: { size?: "sm" | "md"; label?: string; className?: string }) {
  const dim = size === "sm" ? "size-3.5 border-[1.5px]" : "size-5 border-2";
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-ink-500", className)} role="status">
      <span className={cn("inline-block animate-spin rounded-full border-ink-300 border-t-ink-700", dim)} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
