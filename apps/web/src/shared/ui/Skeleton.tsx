import { cn } from "../lib/cn.ts";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink-200/70", className)} aria-hidden />;
}
