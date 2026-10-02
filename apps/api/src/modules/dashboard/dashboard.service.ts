import type { AuthedUser } from "../../lib/auth/user.js";
import { approvalCounts, decisionsNeeded, expireOverdue } from "../approvals/index.js";
import { agentGrants, agentsApprovedByRole } from "../policy/index.js";
import { listRunsFor, runsRepository, runViews, type RunStatus } from "../runs/index.js";
import { runtimeClient } from "../runtime/index.js";

const RECENT_RUNS = 8;
const DECISIONS_SHOWN = 6;

function runCountsView(counts: Record<RunStatus, number>) {
  return {
    activeRuns: counts.RUNNING + counts.PENDING,
    suspendedRuns: counts.SUSPENDED_FOR_APPROVAL,
    succeededRuns: counts.SUCCEEDED,
    failedRuns: counts.FAILED + counts.EXPIRED + counts.HALTED_LOOP_GUARD,
    rejectedRuns: counts.REJECTED,
  };
}

export async function dashboardSummary(user: AuthedUser) {
  await expireOverdue();
  const [pending, runCounts, recentRuns, needsDecision, runtime] = await Promise.all([
    approvalCounts(user),
    runsRepository.countByStatus(user.role === "admin" ? {} : { requestedBy: user.id }),
    listRunsFor(user, { limit: RECENT_RUNS }),
    decisionsNeeded(user, DECISIONS_SHOWN),
    runtimeClient.health(),
  ]);
  return {
    role: user.role,
    grants: { agents: agentGrants(user.role), approves: agentsApprovedByRole(user.role) },
    counts: { ...pending, ...runCountsView(runCounts) },
    needsDecision,
    recentRuns: await runViews(recentRuns),
    runtime,
  };
}
