import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { BRIDGE_OPS, READ_ONLY_OPS } from "@aura/bridge";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound, unauthenticated } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { runNotes } from "../runs/run-notes.js";
import { logger } from "../../lib/logger.js";
import { writeAudit } from "../audit/audit.service.js";
import { runsRepository } from "../runs/runs.repository.js";
import { bridgeHub } from "./hub.js";
import { designDocsInternalRouter } from "../design-docs/design-docs.internal.js";

// Called by apps/agent-runtime only: an agent's workspace tool (read a file, run a command) is
// forwarded to the VS Code extension of the developer who owns the run, and answered here once
// the extension replies. This reverses the usual direction (runtime → API), so it is guarded by
// the same shared secret: MASTRA_RUNTIME_TOKEN. Without it (local mode) only loopback callers
// are accepted.

function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function requireRuntime(req: Request, _res: Response, next: NextFunction) {
  const token = env.runtimeToken;
  if (!token) return isLoopback(req) ? next() : next(forbidden("Runtime calls are accepted only on loopback without MASTRA_RUNTIME_TOKEN"));
  const given = Buffer.from((req.header("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(unauthenticated("Invalid runtime token"));
  next();
}

export const internalRouter = Router();
internalRouter.use(requireRuntime);
// Design documents written by agents after an approved gate (modules/design-docs).
internalRouter.use("/design-docs", designDocsInternalRouter);

const callSchema = z
  .object({
    runId: z.string().uuid(),
    op: z.enum(BRIDGE_OPS),
    args: z.record(z.string(), z.unknown()),
    timeoutMs: z.number().int().min(1000).max(30 * 60_000).optional(),
    readOnly: z.boolean().optional(),
    worktree: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/).refine((w) => !w.includes(".."), "invalid worktree").optional(),
  })
  .strict();

// POST /internal/bridge/calls → { ok: true, value } | { ok: false, error: { code, message } }
internalRouter.post(
  "/bridge/calls",
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(callSchema, req.body);
    const run = await runsRepository.findById(body.runId);
    if (!run) throw notFound("Run");
    const outcome = await bridgeHub.call(run.requested_by, run.id, body.op, body.args, body.timeoutMs, { readOnly: body.readOnly, worktree: body.worktree });

    // Every change made on a developer's machine is in the audit log; reads only in the server log.
    const changes = !READ_ONLY_OPS.includes(body.op);
    const summary = { op: body.op, path: body.args.path ?? body.args.src ?? null, command: body.op === "sandbox.exec" || body.op === "proc.spawn" ? [body.args.command, ...((body.args.args as unknown[]) ?? [])].join(" ").slice(0, 300) : null };
    logger.info("bridge call", { runId: run.id, ...summary, ok: outcome.ok, durationMs: outcome.durationMs, error: outcome.ok ? undefined : outcome.error.code });
    if (changes) {
      await writeAudit({
        actorId: run.requested_by,
        actorRole: run.requested_by_role,
        action: "bridge.tool.call",
        entityType: "workflow_run",
        entityId: run.id,
        requestId: req.requestId,
        metadata: { ...summary, ok: outcome.ok, error: outcome.ok ? null : outcome.error, durationMs: outcome.durationMs },
      });
    }
    res.json(outcome);
  }),
);

// GET /internal/runs/:id/notes: the notes the developer typed since the last read, marked
// delivered (V4: the coders read them between steps).
internalRouter.get(
  "/runs/:id/notes",
  asyncHandler(async (req, res) => {
    const run = await runsRepository.findById(uuidParam(req.params.id, "Run"));
    if (!run) throw notFound("Run");
    res.json({ notes: await runNotes.take(run.id) });
  }),
);
