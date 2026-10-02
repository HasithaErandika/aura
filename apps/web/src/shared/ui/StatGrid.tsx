import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

const columns = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
};

export function StatGrid({ cols = 4, children }: { cols?: keyof typeof columns; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-4", columns[cols])}>{children}</div>;
}
