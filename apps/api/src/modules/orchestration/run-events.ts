import { EventEmitter } from "node:events";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger, errorMessage } from "../../lib/logger.js";

// Durable run events (supabase/migrations/0009_run_events.sql). A turn job writes every client
// event here (RunEventWriter); clients follow them (followRun) live or after a reconnect. The
// table is the only source of truth: followers always read from it. The in-process bus only wakes
// them early, and a short poll covers events written by another process (a second API replica).

export interface RunEvent {
  id: number;
  runId: string;
  event: string;
  data: unknown;
}

// What a turn writes to. SseWriter has the same shape, so pipeRuntimeStream works with both.
export interface EventSink {
  send(event: string, data: unknown): void;
}

export interface RunEventStore {
  append(runId: string, event: string, data: unknown): Promise<number>;
  listAfter(runId: string, afterId: number, limit: number): Promise<RunEvent[]>;
  lastId(runId: string): Promise<number>;
  // Id of the run's last event of this kind, 0 if none (e.g. the "done" that ended the previous turn).
  lastIdOf(runId: string, event: string): Promise<number>;
}

export const supabaseRunEventStore: RunEventStore = {
  async append(runId, event, data) {
    const { data: row, error } = await supabaseAdmin.from("run_events").insert({ run_id: runId, event, data: data ?? null }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "could not store run event");
    return Number((row as { id: number }).id);
  },
  async listAfter(runId, afterId, limit) {
    const { data, error } = await supabaseAdmin.from("run_events").select("id, event, data").eq("run_id", runId).gt("id", afterId).order("id").limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: number; event: string; data: unknown }[]).map((r) => ({ id: Number(r.id), runId, event: r.event, data: r.data }));
  },
  async lastId(runId) {
    const { data, error } = await supabaseAdmin.from("run_events").select("id").eq("run_id", runId).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? Number((data as { id: number }).id) : 0;
  },
  async lastIdOf(runId, event) {
    const { data, error } = await supabaseAdmin.from("run_events").select("id").eq("run_id", runId).eq("event", event).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? Number((data as { id: number }).id) : 0;
  },
};

// In-process notification that a run has new events. Never carries the events themselves.
export const runEventBus = new EventEmitter();
runEventBus.setMaxListeners(0);

const TEXT_FLUSH_MS = 120;

// Writes one run's events in order. send() is synchronous for the caller; writes are chained.
// Streamed text deltas are merged for a moment so a long answer isn't thousands of rows.
export class RunEventWriter implements EventSink {
  private chain: Promise<void> = Promise.resolve();
  private pendingText = "";
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly runId: string,
    private readonly store: RunEventStore = supabaseRunEventStore,
    private readonly bus: EventEmitter = runEventBus,
  ) {}

  send(event: string, data: unknown): void {
    if (event === "text") {
      const delta = (data as { delta?: unknown } | null)?.delta;
      if (typeof delta === "string") {
        this.pendingText += delta;
        if (!this.timer) this.timer = setTimeout(() => this.flushText(), TEXT_FLUSH_MS);
        return;
      }
    }
    this.flushText();
    this.enqueue(event, data);
  }

  // Waits until everything sent so far is stored.
  async flush(): Promise<void> {
    this.flushText();
    await this.chain;
  }

  private flushText() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.pendingText) return;
    const delta = this.pendingText;
    this.pendingText = "";
    this.enqueue("text", { delta });
  }

  private enqueue(event: string, data: unknown) {
    this.chain = this.chain.then(async () => {
      try {
        await this.store.append(this.runId, event, data);
        this.bus.emit(this.runId);
      } catch (error) {
        logger.error("run event write failed", { runId: this.runId, event, message: errorMessage(error) });
      }
    });
  }
}

export interface FollowTarget {
  send(id: number, event: string, data: unknown): void;
  comment(text: string): void;
  readonly isClosed: boolean;
}

export interface FollowOptions {
  runId: string;
  afterId: number;
  target: FollowTarget;
  store?: RunEventStore;
  bus?: EventEmitter;
  pollMs?: number;
  heartbeatMs?: number;
}

const PAGE = 500;

// Sends a run's events after `afterId` until its turn ends (a "done" event) or the client goes.
// Resolves with the last event id sent.
export function followRun(options: FollowOptions): Promise<number> {
  const { runId, target } = options;
  const store = options.store ?? supabaseRunEventStore;
  const bus = options.bus ?? runEventBus;
  let lastId = options.afterId;

  return new Promise((resolve) => {
    let finished = false;
    let draining = false;
    let again = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      bus.off(runId, wake);
      clearInterval(poll);
      clearInterval(heartbeat);
      resolve(lastId);
    };

    const drain = async () => {
      if (draining) {
        again = true;
        return;
      }
      draining = true;
      try {
        do {
          again = false;
          if (target.isClosed) return finish();
          const events = await store.listAfter(runId, lastId, PAGE);
          for (const e of events) {
            target.send(e.id, e.event, e.data);
            lastId = e.id;
            if (e.event === "done") return finish();
          }
          if (events.length === PAGE) again = true;
        } while (again && !finished);
      } catch (error) {
        logger.warn("run event read failed", { runId, message: errorMessage(error) });
      } finally {
        draining = false;
      }
    };

    function wake() {
      void drain();
    }

    bus.on(runId, wake);
    const poll = setInterval(() => (target.isClosed ? finish() : void drain()), options.pollMs ?? 1000);
    const heartbeat = setInterval(() => (target.isClosed ? finish() : target.comment("keep-alive")), options.heartbeatMs ?? 15_000);
    void drain();
  });
}
