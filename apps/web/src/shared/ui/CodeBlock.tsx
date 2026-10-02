import { cn } from "../lib/cn.ts";

export function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={cn("scroll-quiet max-h-96 overflow-auto rounded-md border border-line bg-ink-50 px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-ink-700", className)}>
      {children}
    </pre>
  );
}
