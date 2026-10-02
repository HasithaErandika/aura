import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden, notFound } from "../../lib/http/errors.js";
import { currentUser } from "../../middleware/auth.js";
import { AGENT_APPROVER_ROLE, agentAccess, canReadAgent, canonicalAgentId, gateInfoFor, rolesWithAccess } from "../policy/policy.js";
import { runtimeClient } from "../runtime/runtime.client.js";
import type { RuntimeAgentSummary } from "../runtime/runtime.types.js";

export const agentsRouter = Router();

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

// GET /agents: the runtime's agents with the caller's access; non-admins see only readable ones.
agentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const agents = await runtimeClient.listAgents();
    const entries = Object.entries(agents)
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
    const agent = (await runtimeClient.listAgents())[agentId];
    if (!agent) throw notFound("Agent");
    res.json({ agent: toRegistryEntry(agentId, agent, user.role) });
  }),
);
