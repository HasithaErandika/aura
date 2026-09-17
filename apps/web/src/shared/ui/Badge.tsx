import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type Tone = "neutral" | "success" | "warning" | "danger" | "brand" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-brand-soft text-brand",
  outline: "border border-line text-ink-600",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap", tones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
