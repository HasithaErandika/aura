import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { HttpError, forbidden } from "../../lib/http/errors.js";
import { idParam, parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canReadAgent, canRunAgent } from "../policy/policy.js";
import { writeAudit } from "../audit/audit.service.js";
import { runtimeClient } from "../runtime/runtime.client.js";

// Coding Council side channels (docs/plans/aura-code-cli-council.md section 4.4). Starting and
// approving a council run goes through the normal thread + approval endpoints; these only add
// human notes to a running council and report today's model usage.

export const councilRouter = Router();

const noteSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

// POST /council/:draftId/notes - a note the council reads at its next agent turn (`aura say`).
// Needs "run" on coding-council in the policy tables (Developer); every note is audited because
// it steers what the agents write.
councilRouter.post(
  "/:draftId/notes",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!canRunAgent(user.role, "coding-council")) throw forbidden("Your role cannot steer the Coding Council");
    const draftId = idParam(req.params.draftId, "Coding draft");
    const { text } = parseOrThrow(noteSchema, req.body);
    let result: { queued: number; taskKey: string };
    try {
      result = await runtimeClient.addCouncilNote(draftId, text);
    } catch (error) {
      // The runtime's own refusal (unknown draft, not a council run, already finished) becomes a
      // 409 with its reason; an unreachable runtime propagates as-is.
      if (!(error instanceof HttpError) || error.code !== "upstream_error") throw error;
      const details = error.details as { error?: string } | undefined;
      throw new HttpError(409, "conflict", details?.error ?? `Could not add a note to ${draftId}`);
    }
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "council.note",
      entityType: "coding_draft",
      entityId: draftId,
      requestId: req.requestId,
      metadata: { taskKey: result.taskKey, length: text.length },
    });
    res.json({ queued: result.queued });
  }),
);

// GET /council/usage - today's per-model request/token counts.
councilRouter.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!canReadAgent(user.role, "coding-council")) throw forbidden("Your role cannot view Coding Council usage");
    res.json(await runtimeClient.councilUsage());
  }),
);
