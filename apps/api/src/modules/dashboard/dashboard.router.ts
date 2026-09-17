import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { currentUser } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { agentsApprovedByRole, ROLE_AGENT_GRANTS } from "../policy/policy.js";
import { approvalsRepository } from "../approvals/approvals.repository.js";
import { expireOverdue, toApprovalViews } from "../approvals/approvals.service.js";
import { runsRepository } from "../runs/runs.repository.js";
import { toRunView } from "../runs/runs.types.js";
import { runtimeClient } from "../runtime/runtime.client.js";

export const dashboardRouter = Router();

// One call for the landing screen after sign-in: counts, what needs the caller's decision,
// their recent runs, and whether the runtime is up. Everything comes from live records.
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await expireOverdue();
    const isAdmin = user.role === "admin";
    const approves = agentsApprovedByRole(user.role);

    const [pendingForRole, pendingOnMyRuns, runCounts, recentRuns, needsDecision, runtime] = await Promise.all([
      approvalsRepository.countPending({ requiredRole: isAdmin ? undefined : user.role }),
      approvalsRepository.countPending({ requestedBy: user.id }),
      runsRepository.countByStatus(isAdmin ? {} : { requestedBy: user.id }),
      isAdmin ? runsRepository.list({ limit: 8 }) : runsRepository.listVisibleTo(user.id, approves, 8),
      isAdmin
        ? approvalsRepository.list({ status: ["PENDING"], limit: 6 })
        : approvalsRepository.listForUser(user.id, user.role, ["PENDING"], 6),
      runtimeClient.health(),
    ]);

    const profiles = await profilesById(recentRuns.map((r) => r.requested_by));

    res.json({
      role: user.role,
      grants: { agents: ROLE_AGENT_GRANTS[user.role], approves },
      counts: {
        pendingForMyRole: pendingForRole,
        pendingOnMyRuns: pendingOnMyRuns,
        activeRuns: (runCounts.RUNNING ?? 0) + (runCounts.PENDING ?? 0),
        suspendedRuns: runCounts.SUSPENDED_FOR_APPROVAL ?? 0,
        succeededRuns: runCounts.SUCCEEDED ?? 0,
        failedRuns: (runCounts.FAILED ?? 0) + (runCounts.EXPIRED ?? 0) + (runCounts.HALTED_LOOP_GUARD ?? 0),
        rejectedRuns: runCounts.REJECTED ?? 0,
      },
      needsDecision: await toApprovalViews(needsDecision, user),
      recentRuns: recentRuns.map((row) => {
        const p = profiles.get(row.requested_by);
        return toRunView(row, p ? { fullName: p.fullName, email: p.email } : null);
      }),
      runtime,
    });
  }),
);
