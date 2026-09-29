import { describe, expect, it } from 'vitest';
import { metrics, renderMetrics } from './metrics';

describe('metrics', () => {
  it('renders counters and histograms in the Prometheus text format', () => {
    metrics.toolCalls.inc({ tool: 'delegate_to_po', mode: 'draft', tier: 'low', outcome: 'ok' });
    metrics.toolCalls.inc({ outcome: 'ok', tier: 'low', mode: 'draft', tool: 'delegate_to_po' });
    metrics.toolDuration.observe({ tool: 'delegate_to_po', mode: 'draft' }, 0.7);
    metrics.gatewayBlocks.inc({ tool: 'x', reason: 'say "hi"\nnow' });
    const text = renderMetrics();
    expect(text).toContain('# TYPE aura_tool_calls_total counter');
    expect(text).toContain('aura_tool_calls_total{mode="draft",outcome="ok",tier="low",tool="delegate_to_po"} 2');
    expect(text).toContain('aura_tool_duration_seconds_bucket{mode="draft",tool="delegate_to_po",le="0.5"} 0');
    expect(text).toContain('aura_tool_duration_seconds_bucket{mode="draft",tool="delegate_to_po",le="1"} 1');
    expect(text).toContain('aura_tool_duration_seconds_bucket{mode="draft",tool="delegate_to_po",le="+Inf"} 1');
    expect(text).toContain('aura_tool_duration_seconds_count{mode="draft",tool="delegate_to_po"} 1');
    expect(text).toContain('reason="say \\"hi\\"\\nnow"');
    expect(text.endsWith('\n')).toBe(true);
  });
});
