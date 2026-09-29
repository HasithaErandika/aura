// A small in-process metrics registry, rendered in the Prometheus text format at GET /metrics
// (server/metrics-route.ts, behind the runtime token). No dependency: counters and histograms are
// all the runtime needs, and per-process values are what Prometheus expects to scrape.

type Labels = Record<string, string>;

function key(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');
}

class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  get(labels: Labels = {}): number {
    return this.values.get(key(labels)) ?? 0;
  }
  total(): number {
    let sum = 0;
    for (const v of this.values.values()) sum += v;
    return sum;
  }
  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, v] of this.values) lines.push(`${this.name}${k ? `{${k}}` : ''} ${v}`);
    return lines;
  }
}

class Histogram {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    readonly bounds: number[],
  ) {}
  observe(labels: Labels, value: number): void {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) this.series.set(k, (s = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 }));
    this.bounds.forEach((b, i) => {
      if (value <= b) s!.buckets[i]++;
    });
    s.sum += value;
    s.count++;
  }
  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [k, s] of this.series) {
      const sep = k ? `${k},` : '';
      this.bounds.forEach((b, i) => lines.push(`${this.name}_bucket{${sep}le="${b}"} ${s.buckets[i]}`));
      lines.push(`${this.name}_bucket{${sep}le="+Inf"} ${s.count}`);
      lines.push(`${this.name}_sum${k ? `{${k}}` : ''} ${s.sum}`);
      lines.push(`${this.name}_count${k ? `{${k}}` : ''} ${s.count}`);
    }
    return lines;
  }
}

export const metrics = {
  toolCalls: new Counter('aura_tool_calls_total', 'Orchestrator tool calls through the gateway, by tool, mode, risk tier and outcome (ok, failed, blocked, error).'),
  toolDuration: new Histogram('aura_tool_duration_seconds', 'Duration of Orchestrator tool calls that ran.', [0.1, 0.5, 1, 5, 15, 60, 300, 900, 1800]),
  gatewayBlocks: new Counter('aura_gateway_blocks_total', 'Tool calls the gateway refused, by tool and reason.'),
  untrustedFindings: new Counter('aura_untrusted_findings_total', 'Possible prompt-injection findings in untrusted content, by rule and severity.'),
  approvalsUsed: new Counter('aura_approvals_used_total', 'Human approvals claimed by a gated step, by tool.'),
  modelCalls: new Counter('aura_model_calls_total', 'Model calls, by agent.'),
  modelTokens: new Counter('aura_model_tokens_total', 'Model tokens, by agent and type (input, output, reasoning, cached).'),
  contextCharsSaved: new Counter('aura_context_chars_saved_total', 'Characters of draft text sent to the human directly instead of into the Orchestrator context, by tool.'),
};

export function renderMetrics(): string {
  const all = [metrics.toolCalls, metrics.toolDuration, metrics.gatewayBlocks, metrics.untrustedFindings, metrics.approvalsUsed, metrics.modelCalls, metrics.modelTokens, metrics.contextCharsSaved];
  return `${all.flatMap((m) => m.render()).join('\n')}\n`;
}
