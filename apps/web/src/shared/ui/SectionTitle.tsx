import type { ReactNode } from "react";
import { Badge } from "./Badge.tsx";

export function SectionTitle({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{children}</h3>
      {typeof count === "number" ? <Badge tone="outline">{count}</Badge> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
