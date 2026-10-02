import { PgBoss } from "pg-boss";
import { env } from "../../config/env.js";
import { errorMessage, logger } from "../../lib/logger.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { expireOverdue } from "../approvals/approvals.service.js";
import { runsRepository } from "../runs/runs.repository.js";
import type { RuntimeApprover, RuntimeDecision } from "../runtime/runtime.types.js";
import { RunEventWriter } from "./run-events.js";
import { resumeTurn, startTurn } from "./run-stream.service.js";

// Agent turns as background jobs (docs/plans/aura-automation-durability.md Part C). The HTTP
// request records the run and queues the turn; a worker runs it and writes its events
// (run-events.ts), which clients follow. Closing the browser no longer stops a turn.
//
//   DATABASE_URL set  → pg-boss queue in Postgres (schema "pgboss"): limits per process and per
//                       user, survives an API restart while waiting, dead-letter queue.
//   otherwise         → the turn runs in this process straight away (no queue).
//
// A turn is never retried automatically: replaying an agent turn could repeat a side effect. A
// turn whose process stopped is marked INTERRUPTED by the stale-run sweep and continued by the
// user with a new message.

export type JobUser = Pick<AuthedUser, "id" | "email" | "fullName" | "role" | "via">;

export type TurnJob =
  | { kind: "start"; runId: string; message: string; requestId: string; user: JobUser }
  | {
      kind: "resume";
      runId: string;
      runtimeRunId: string;
      toolCallId: string;
      resumeData: string;
      approver: RuntimeApprover | null;
      decision: RuntimeDecision;
      requestId: string;
      user: JobUser;
    };

const TURN_QUEUE = "aura-turn";
const TURN_DEAD_LETTER = "aura-turn-failed";
const MAINTENANCE_QUEUE = "aura-maintenance";
// Longer than the longest allowed turn (Settings → Limits: 180 minutes).
const TURN_EXPIRE_SECONDS = 3 * 3600 + 600;
// A running turn touches its run this often; one silent for STALE_AFTER_MS is interrupted.
const HEARTBEAT_MS = 30_000;
export const STALE_AFTER_MS = 3 * 60_000;

// Turns running in this process, by run id, so Stop can abort them (POST /runs/:id/stop).
const localTurns = new Map<string, AbortController>();

// Aborts a turn running in this process. False when it runs elsewhere or has already ended.
export function stopTurn(runId: string): boolean {
  const controller = localTurns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function jobUser(user: AuthedUser): JobUser {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, via: user.via };
}

// Runs one turn job to the end. Always ends the turn's event stream with "done", even on a
// failure before the runtime was reached, so followers never wait forever.
export async function runTurnJob(job: TurnJob): Promise<void> {
  const writer = new RunEventWriter(job.runId);
  const heartbeat = setInterval(() => void runsRepository.touch(job.runId).catch(() => undefined), HEARTBEAT_MS);
  const stop = new AbortController();
  localTurns.set(job.runId, stop);
  try {
    const run = await runsRepository.findById(job.runId);
    if (!run) throw new Error(`run ${job.runId} not found`);
    // Stopped while still queued: POST /runs/:id/stop already ended it.
    if (run.status === "INTERRUPTED") return;
    const user = job.user as AuthedUser;
    if (job.kind === "start") {
      await startTurn({ run, user, message: job.message, requestId: job.requestId, writer, stop: stop.signal });
    } else {
      await resumeTurn({
        user,
        run,
        runtimeRunId: job.runtimeRunId,
        toolCallId: job.toolCallId,
        resumeData: job.resumeData,
        approver: job.approver,
        decision: job.decision,
        requestId: job.requestId,
        writer,
        stop: stop.signal,
      });
    }
  } catch (error) {
    const message = errorMessage(error);
    logger.error("turn job failed", { runId: job.runId, kind: job.kind, message });
    await runsRepository.update(job.runId, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() }).catch(() => undefined);
    writer.send("error", { message });
    writer.send("done", { runId: job.runId, status: "FAILED", approvalId: null });
  } finally {
    localTurns.delete(job.runId);
    clearInterval(heartbeat);
    await writer.flush();
  }
}

// Runs RUNNING with no heartbeat for STALE_AFTER_MS belong to a process that stopped.
export async function interruptStaleRuns(now = Date.now()): Promise<number> {
  const stale = await runsRepository.listStale(new Date(now - STALE_AFTER_MS).toISOString());
  for (const run of stale) {
    const message = "The turn stopped because AURA restarted. Send a message to continue.";
    await runsRepository.update(run.id, { status: "INTERRUPTED", last_error: message, finished_at: new Date(now).toISOString() });
    const writer = new RunEventWriter(run.id);
    writer.send("error", { message });
    writer.send("done", { runId: run.id, status: "INTERRUPTED", approvalId: null });
    await writer.flush();
  }
  if (stale.length) logger.warn("interrupted stale runs", { count: stale.length });
  return stale.length;
}

async function maintenance(): Promise<void> {
  await expireOverdue(true).catch((error) => logger.warn("approval expiry failed", { message: errorMessage(error) }));
  await interruptStaleRuns().catch((error) => logger.warn("stale-run sweep failed", { message: errorMessage(error) }));
}

export interface TurnQueue {
  readonly kind: "pg-boss" | "inline";
  enqueue(job: TurnJob): Promise<void>;
  stop(): Promise<void>;
}

function inlineQueue(): TurnQueue {
  const timer = setInterval(() => void maintenance(), 60_000);
  void maintenance();
  return {
    kind: "inline",
    async enqueue(job) {
      void runTurnJob(job);
    },
    async stop() {
      clearInterval(timer);
    },
  };
}

async function pgBossQueue(connectionString: string): Promise<TurnQueue> {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (error) => logger.error("pg-boss error", { message: errorMessage(error) }));
  await boss.start();
  await boss.createQueue(TURN_DEAD_LETTER, { retryLimit: 0 });
  await boss.createQueue(TURN_QUEUE, { retryLimit: 0, expireInSeconds: TURN_EXPIRE_SECONDS, deadLetter: TURN_DEAD_LETTER });
  await boss.createQueue(MAINTENANCE_QUEUE, { retryLimit: 0, expireInSeconds: 300 });
  await boss.work<TurnJob>(TURN_QUEUE, { localConcurrency: env.turnConcurrency, groupConcurrency: env.turnConcurrencyPerUser, pollingIntervalSeconds: 0.5 }, async ([job]) => {
    if (job) await runTurnJob(job.data);
  });
  await boss.work(MAINTENANCE_QUEUE, async () => maintenance());
  await boss.schedule(MAINTENANCE_QUEUE, "* * * * *");
  return {
    kind: "pg-boss",
    async enqueue(job) {
      await boss.send(TURN_QUEUE, job, { group: { id: job.user.id } });
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
  };
}

let queue: TurnQueue | null = null;

export async function startTurnQueue(): Promise<TurnQueue> {
  if (!queue) {
    queue = env.databaseUrl ? await pgBossQueue(env.databaseUrl) : inlineQueue();
    logger.info("turn queue started", { kind: queue.kind, concurrency: env.turnConcurrency, perUser: env.turnConcurrencyPerUser });
  }
  return queue;
}

export async function enqueueTurn(job: TurnJob): Promise<void> {
  await (await startTurnQueue()).enqueue(job);
}

export async function stopTurnQueue(): Promise<void> {
  await queue?.stop();
  queue = null;
}
