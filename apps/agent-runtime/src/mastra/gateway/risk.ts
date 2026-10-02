import type { AgentId } from '../agents/registry';

// Risk tier of every delegate tool call, by tool and mode (docs/ARCHITECTURE.md §6.2):
//   low     runs straight away, recorded (reads, drafts, revisions, status)
//   medium  writes to Jira, design documents or git: needs a recorded human decision, used once
// A tool or mode missing from this table is refused (gateway.ts), so a new mode can't ship
// without someone deciding its tier. gateway.test.ts checks the table against the real schemas.

export type RiskTier = 'low' | 'medium';

export interface ToolRisk {
  agentId: AgentId;
  modes: Record<string, RiskTier>;
}

export const TOOL_RISK: Record<string, ToolRisk> = {
  delegate_to_po: { agentId: 'po-agent', modes: { draft: 'low', revise: 'low', file: 'medium' } },
  delegate_to_ba: { agentId: 'ba-agent', modes: { draft: 'low', revise: 'low', file: 'medium' } },
  delegate_to_architect: { agentId: 'architect-agent', modes: { draft: 'low', revise: 'low', file: 'medium' } },
  delegate_to_qa: { agentId: 'qa-agent', modes: { draft: 'low', revise: 'low', file: 'medium' } },
  delegate_to_deploy: { agentId: 'deployer-agent', modes: { draft: 'low', revise: 'low', file: 'medium' } },
  // A Task in VS Code (tools/task-tools.ts). A plan changes nothing. execute writes code after
  // Gate 4; revise is another pass of that same approved plan, still under the developer's own
  // permission prompts, after they asked for it at Gate 5; accept records Gate 5.
  delegate_to_planner: { agentId: 'task-planner', modes: { draft: 'low', revise: 'low' } },
  delegate_to_coder: { agentId: 'coder', modes: { execute: 'medium', revise: 'low' } },
  delegate_to_review: { agentId: 'coder', modes: { accept: 'medium' } },
  // Gate 6: a PR draft and its CI status change nothing; open pushes and opens the PR.
  delegate_to_pr: { agentId: 'git-agent', modes: { draft: 'low', open: 'medium', status: 'low' } },
};

export function riskOf(toolId: string, mode: unknown): { agentId: AgentId; tier: RiskTier } | null {
  const entry = TOOL_RISK[toolId];
  const tier = typeof mode === 'string' ? entry?.modes[mode] : undefined;
  return entry && tier ? { agentId: entry.agentId, tier } : null;
}
