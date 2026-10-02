import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, string> = {
  info: "border-line bg-neutral-soft text-ink-700",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
};

export function Alert({ tone = "info", title, children, className, actions }: { tone?: AlertTone; title?: string; children?: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      <div className="min-w-0 flex-1 break-words">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
