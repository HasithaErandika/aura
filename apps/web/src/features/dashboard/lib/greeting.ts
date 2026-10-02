import type { Me } from "@/shared/api/types.ts";
import { agentLabel } from "@/shared/lib/agents.ts";
import { canUseWorkspace, worksInVsCode } from "@/shared/lib/access.ts";

export function firstName(me: Pick<Me, "fullName" | "email">): string {
  return me.fullName?.trim().split(/\s+/)[0] || me.email;
}

export function roleSummary(me: Me): string {
  const base = `You are signed in as ${me.roleLabel}.`;
  const approves = me.grants.approves.map(agentLabel);
  if (approves.length) return `${base} You sign off on ${approves.join(" and ")} drafts.`;
  if (worksInVsCode(me)) return `${base} You plan, review and open pull requests for Tasks in AURA for VS Code.`;
  if (canUseWorkspace(me)) return `${base} You brief the Orchestrator in the Agent Workspace.`;
  if (me.role === "admin") return `${base} You can watch every gate, run and audit record.`;
  return base;
}
