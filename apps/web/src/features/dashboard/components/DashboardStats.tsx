import { Stat } from "@/shared/ui/Stat.tsx";
import { StatGrid } from "@/shared/ui/StatGrid.tsx";
import type { DashboardSummary } from "../types.ts";

export function DashboardStats({ counts, isAdmin }: { counts: DashboardSummary["counts"] | null; isAdmin: boolean }) {
  const show = (n: number | undefined) => (counts ? (n ?? 0) : "-");
  return (
    <StatGrid>
      <Stat label={isAdmin ? "Pending gates" : "Needs my decision"} value={show(counts?.pendingForMyRole)} hint="Human gates waiting" />
      <Stat label="Active runs" value={show(counts?.activeRuns)} hint="Running or queued" />
      <Stat label="Waiting on a person" value={show(counts?.suspendedRuns)} hint="Suspended for approval" />
      <Stat label="Completed" value={show(counts?.succeededRuns)} hint={counts ? `${counts.failedRuns} failed or expired` : undefined} />
    </StatGrid>
  );
}
