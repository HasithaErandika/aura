import type { Role } from "../../lib/auth/roles.js";
import { notFound } from "../../lib/http/errors.js";
import { AGENT_APPROVER_ROLE, agentAccess, assertCanReadAgent, canReadAgent, canonicalAgentId, gateInfoFor, rolesWithAccess } from "../policy/index.js";
import { runtimeClient, type RuntimeAgentSummary } from "../runtime/index.js";

function toRegistryEntry(id: string, agent: RuntimeAgentSummary, role: Role) {
  const suggested = agent.metadata?.suggestedPrompts;
  return {
    id,
    name: agent.name,
    description: agent.description ?? null,
    model: agent.modelId ? `${agent.provider ? `${agent.provider}/` : ""}${agent.modelId}` : null,
    supportsMemory: agent.supportsMemory ?? false,
    maxSteps: agent.defaultOptions?.maxSteps ?? null,
    tools: Object.entries(agent.tools ?? {}).map(([toolId, tool]) => ({ id: tool.id ?? toolId, description: tool.description ?? null })),
    suggestedPrompts: Array.isArray(suggested) ? suggested.filter((p): p is string => typeof p === "string") : [],
    access: agentAccess(role, id),
    approverRole: AGENT_APPROVER_ROLE[canonicalAgentId(id)] ?? null,
    gate: gateInfoFor(id),
    grants: { run: rolesWithAccess(id, "run"), read: rolesWithAccess(id, "read") },
  };
}

export async function listAgentsFor(role: Role) {
  const agents = await runtimeClient.listAgents();
  return Object.entries(agents)
    .filter(([id]) => role === "admin" || canReadAgent(role, id))
    .map(([id, agent]) => toRegistryEntry(id, agent, role));
}

export async function getAgentFor(role: Role, agentId: string) {
  if (role !== "admin") assertCanReadAgent(role, agentId);
  const agents = await runtimeClient.listAgents();
  if (!Object.hasOwn(agents, agentId)) throw notFound("Agent");
  return toRegistryEntry(agentId, agents[agentId]!, role);
}
