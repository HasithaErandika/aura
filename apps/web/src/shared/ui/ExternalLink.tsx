import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ExternalLinkIcon } from "../icons/index.tsx";

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900 hover:underline", className)}>
      {children}
      <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
