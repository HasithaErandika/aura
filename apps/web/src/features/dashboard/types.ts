import type { Approval, Grants, Run, RuntimeHealth } from "@/shared/api/types.ts";
import type { Role } from "@/shared/lib/roles.ts";

export interface DashboardSummary {
  role: Role;
  grants: Grants;
  counts: {
    pendingForMyRole: number;
    pendingOnMyRuns: number;
    activeRuns: number;
    suspendedRuns: number;
    succeededRuns: number;
    failedRuns: number;
    rejectedRuns: number;
  };
  needsDecision: Approval[];
  recentRuns: Run[];
  runtime: RuntimeHealth;
}
