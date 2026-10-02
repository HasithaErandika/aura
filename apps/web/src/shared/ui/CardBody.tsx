import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}
