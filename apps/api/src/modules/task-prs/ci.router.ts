import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { bearerToken } from "../../lib/http/bearer.js";
import { unauthenticated } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { writeAudit } from "../audit/index.js";
import { OidcError, verifyGithubOidc } from "./oidc.js";
import { ciReportSchema } from "./task-prs.schemas.js";
import { recordCiReport } from "./task-prs.service.js";

export const ciRouter = Router();

async function verifiedRepository(header: string | undefined): Promise<string> {
  const token = bearerToken(header);
  if (!token) throw unauthenticated("A GitHub Actions OIDC token is required");
  try {
    return (await verifyGithubOidc(token, { audience: env.ciOidcAudience })).repository;
  } catch (error) {
    if (error instanceof OidcError) throw unauthenticated(error.message);
    throw error;
  }
}

ciRouter.post(
  "/report",
  asyncHandler(async (req, res) => {
    const repo = await verifiedRepository(req.header("authorization"));
    const report = parseOrThrow(ciReportSchema, req.body);
    const { view, qa } = await recordCiReport(repo, report);
    await writeAudit({
      actorId: null,
      actorRole: null,
      action: "ci.reported",
      entityType: "task_branch",
      entityId: view.taskKey,
      requestId: req.requestId,
      metadata: { repo, branch: report.branch, state: view.ciState, prNumber: view.prNumber, headSha: report.headSha ?? null, qa: qa ? { state: qa.state, ...qa.summary } : null },
    });
    // aura-ci.yml posts qa as the "AURA QA" commit status on the pull request.
    res.json({ taskKey: view.taskKey, ciState: view.ciState, qa: qa ? { state: qa.state, description: qa.description } : { state: "pending", description: "Waiting for CI" } });
  }),
);
