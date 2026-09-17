import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { enumList, parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { agentsApprovedByRole, canViewRun } from "../policy/policy.js";
import { approvalsRepository } from "../approvals/approvals.repository.js";
import { toApprovalViews } from "../approvals/approvals.service.js";
import { runsRepository } from "./runs.repository.js";
import { RUN_STATUSES, toRunStepView, toRunView, type RunRow } from "./runs.types.js";

export const runsRouter = Router();

const listQuerySchema = z
  .object({
    status: enumList(RUN_STATUSES),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

async function withRequesters(rows: RunRow[]) {
  const profiles = await profilesById(rows.map((r) => r.requested_by));
  return rows.map((row) => {
    const p = profiles.get(row.requested_by);
    return toRunView(row, p ? { fullName: p.fullName, email: p.email } : null);
  });
}

runsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { status, limit } = parseOrThrow(listQuerySchema, req.query);
    let rows =
      user.role === "admin"
        ? await runsRepository.list({ status, limit })
        : await runsRepository.listVisibleTo(user.id, agentsApprovedByRole(user.role), limit);
    if (status?.length && user.role !== "admin") rows = rows.filter((r) => status.includes(r.status));
    res.json({ runs: await withRequesters(rows) });
  }),
);

runsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const run = await runsRepository.findById(uuidParam(req.params.id, "Run"));
    if (!run) throw notFound("Run");
    if (!canViewRun(user, { requestedBy: run.requested_by, currentAgent: run.current_agent })) throw forbidden("You cannot view this run");

    const [steps, approvals, [view]] = await Promise.all([
      runsRepository.listSteps(run.id),
      approvalsRepository.list({ runId: run.id, limit: 50 }),
      withRequesters([run]),
    ]);
    res.json({ run: view, steps: steps.map(toRunStepView), approvals: await toApprovalViews(approvals, user) });
  }),
);
