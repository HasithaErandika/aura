import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)} {...props}>
      {children}
    </div>
  );
}
