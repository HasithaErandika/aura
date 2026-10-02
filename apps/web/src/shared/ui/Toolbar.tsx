import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Toolbar({ children, className, align = "between" }: { children: ReactNode; className?: string; align?: "between" | "end" | "start" }) {
  const justify = align === "between" ? "justify-between" : align === "end" ? "justify-end" : "justify-start";
  return <div className={cn("flex flex-wrap items-center gap-2", justify, className)}>{children}</div>;
}
