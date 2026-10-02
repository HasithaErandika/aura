import { PgBoss } from "pg-boss";
import { env } from "../../config/env.js";
import { errorMessage, logger } from "../../lib/logger.js";
import type { AuthedUser } from "../../lib/auth/user.js";
import { expireOverdue } from "../approvals/index.js";
import { runsRepository } from "../runs/index.js";
import type { RuntimeDecision } from "../runtime/index.js";
import { RunEventWriter } from "./run-events.js";
import { resumeTurn, startTurn } from "./run-stream.service.js";

// Turns are never retried: replaying one could repeat a side effect.

export type JobUser = Pick<AuthedUser, "id" | "email" | "fullName" | "role" | "via">;

export type TurnJob =
  | { kind: "start"; runId: string; message: string; requestId: string; user: JobUser }
  | {
      kind: "resume";
      runId: string;
      runtimeRunId: string;
      toolCallId: string;
      resumeData: string;
      decision: RuntimeDecision;
      requestId: string;
      user: JobUser;
    };

const TURN_QUEUE = "aura-turn";
const RESTARTED_MESSAGE = "The turn stopped because AURA restarted. Send a message to continue.";
const TURN_DEAD_LETTER = "aura-turn-failed";
const MAINTENANCE_QUEUE = "aura-maintenance";
// Longer than the longest allowed turn (180 minutes).
const TURN_EXPIRE_SECONDS = 3 * 3600 + 600;
const HEARTBEAT_MS = 30_000;
export const STALE_AFTER_MS = 3 * 60_000;

const localTurns = new Map<string, AbortController>();

export function stopTurn(runId: string): boolean {
  const controller = localTurns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function jobUser(user: AuthedUser): JobUser {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, via: user.via };
}

// Always ends the event stream with "done" so followers never wait forever.
export async function runTurnJob(job: TurnJob): Promise<void> {
  const writer = new RunEventWriter(job.runId);
  const heartbeat = setInterval(() => void runsRepository.touch(job.runId).catch(() => undefined), HEARTBEAT_MS);
  const stop = new AbortController();
  localTurns.set(job.runId, stop);
  try {
    const run = await runsRepository.findById(job.runId);
    if (!run) throw new Error(`run ${job.runId} not found`);
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

export async function interruptStaleRuns(now = Date.now()): Promise<number> {
  const stale = await runsRepository.listStale(new Date(now - STALE_AFTER_MS).toISOString());
  for (const run of stale) {
    await runsRepository.update(run.id, { status: "INTERRUPTED", last_error: RESTARTED_MESSAGE, finished_at: new Date(now).toISOString() });
    const writer = new RunEventWriter(run.id);
    writer.send("error", { message: RESTARTED_MESSAGE });
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

interface TurnQueue {
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
