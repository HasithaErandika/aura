import { EventEmitter } from "node:events";
import { errorMessage, logger } from "../../lib/logger.js";
import { supabaseRunEventStore } from "./run-events.repository.js";

// The run_events table is the source of truth; the bus only wakes followers early.

export interface RunEvent {
  id: number;
  runId: string;
  event: string;
  data: unknown;
}

export interface EventSink {
  send(event: string, data: unknown): void;
}

export interface RunEventStore {
  append(runId: string, event: string, data: unknown): Promise<number>;
  listAfter(runId: string, afterId: number, limit: number): Promise<RunEvent[]>;
  lastId(runId: string): Promise<number>;
  lastIdOf(runId: string, event: string): Promise<number>;
}

const runEventBus = new EventEmitter();
runEventBus.setMaxListeners(0);

const TEXT_FLUSH_MS = 120;

// Writes are chained in order; text deltas are merged briefly so long answers stay few rows.
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

interface FollowTarget {
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

// Resolves with the last event id sent, once "done" arrives or the client goes away.
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
