import type { ToolActivityItem } from "../api/types.ts";
import { cn } from "../lib/cn.ts";
import { describeTool } from "../lib/toolActivity.ts";
import { CodeBlock } from "../ui/CodeBlock.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { Spinner } from "../ui/Spinner.tsx";

function detailText(tool: ToolActivityItem, detail: string | null): string | null {
  if (detail) return detail;
  if (tool.result === undefined || tool.result === null) return null;
  return typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2);
}

export function ToolActivity({ tool }: { tool: ToolActivityItem }) {
  const { title, detail } = describeTool(tool);
  const pending = tool.state === "call";
  const failed = Boolean(tool.isError) || tool.state === "error";
  const text = detailText(tool, detail);

  return (
    <Disclosure
      className={cn("rounded-md border px-3 py-2 text-xs", failed ? "border-danger/20 bg-danger-soft" : "border-line bg-ink-50")}
      summary={
        <span className="flex items-center gap-2">
          {pending ? <Spinner size="sm" /> : <span className={cn("size-1.5 shrink-0 rounded-full", failed ? "bg-danger" : "bg-success")} aria-hidden />}
          <span className={cn("min-w-0 font-medium break-words", failed ? "text-danger" : "text-ink-700")}>{title}</span>
        </span>
      }
    >
      {text ? <CodeBlock className="mt-2 max-h-72 bg-surface">{text}</CodeBlock> : null}
    </Disclosure>
  );
}
