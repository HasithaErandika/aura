import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { currentUser } from "../../middleware/auth.js";
import { AGENT_APPROVER_ROLE, agentAccess, canReadAgent, canonicalAgentId, gateInfoFor, rolesWithAccess } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";
import type { RuntimeAgentSummary } from "../runtime/runtime.types.js";

export const agentsRouter = Router();

// Agents the policy tables grant access to but that have no backing Mastra Agent object in
// apps/agent-runtime - today just "coding-agent" (Gate 5): its `draft` mode is always
// deterministic code, never a model call, for any provider, so there is nothing to register
// there (docs/ARCHITECTURE.md section 6.5). Merged into the listing below so the Registry
// still reflects every real, grantable capability, not only the ones with a live Agent behind
// them.
const SYNTHETIC_AGENTS: Record<string, RuntimeAgentSummary> = {
  "coding-agent": {
    name: "Coding Agent",
    description:
      "Implements a Task's acceptance criteria (Gate 5). draft is always deterministic code, never a model call, for any provider. execute runs one of three interchangeable providers chosen per run: Claude Code or Codex (the developer's own connected key, in a Docker sandbox) or AURA's own built-in agent (no key needed - list_files/read_file/write_file only, no shell access).",
    tools: {},
  },
};

function toRegistryEntry(id: string, agent: RuntimeAgentSummary, role: Parameters<typeof agentAccess>[0]) {
  return {
    id,
    name: agent.name,
    description: agent.description ?? null,
    model: agent.modelId ? `${agent.provider ? `${agent.provider}/` : ""}${agent.modelId}` : null,
    supportsMemory: agent.supportsMemory ?? false,
    maxSteps: agent.defaultOptions?.maxSteps ?? null,
    tools: Object.entries(agent.tools ?? {}).map(([toolId, tool]) => ({ id: tool.id ?? toolId, description: tool.description ?? null })),
    suggestedPrompts: Array.isArray(agent.metadata?.suggestedPrompts) ? (agent.metadata?.suggestedPrompts as string[]) : [],
    access: agentAccess(role, id),
    approverRole: AGENT_APPROVER_ROLE[canonicalAgentId(id)] ?? null,
    gate: gateInfoFor(id),
    grants: { run: rolesWithAccess(id, "run"), read: rolesWithAccess(id, "read") },
  };
}

// GET /agents. The registry is whatever the runtime currently exposes, annotated with the
// caller's access and the policy grants. Agents the role cannot even read are omitted for
// non-admins; admins see everything (they have read on all agents by grant).
agentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const agents = await runtimeClient.listAgents();
    const entries = Object.entries({ ...agents, ...SYNTHETIC_AGENTS })
      .map(([id, agent]) => toRegistryEntry(id, agent, user.role))
      .filter((entry) => user.role === "admin" || canReadAgent(user.role, entry.id));
    res.json({ agents: entries });
  }),
);

agentsRouter.get(
  "/:agentId",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const agentId = req.params.agentId;
    if (user.role !== "admin" && !canReadAgent(user.role, agentId)) throw forbidden("Your role cannot read this agent");
    const agents = await runtimeClient.listAgents();
    const agent = agents[agentId] ?? SYNTHETIC_AGENTS[agentId];
    if (!agent) throw notFound("Agent");
    res.json({ agent: toRegistryEntry(agentId, agent, user.role) });
  }),
);
