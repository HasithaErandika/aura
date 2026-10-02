import type { Me } from "../api/types.ts";

export const isAdmin = (me: Me) => me.role === "admin";

export const canRunAgent = (me: Me, agentId: string) => me.grants.agents[agentId] === "run";

export const canReadAgent = (me: Me, agentId: string) => Boolean(me.grants.agents[agentId]);

export const hasAnyGrant = (me: Me) => Object.keys(me.grants.agents).length > 0 || isAdmin(me);

export const canUseWorkspace = (me: Me) => canRunAgent(me, "orchestrator");

export const takesPartInRuns = (me: Me) => me.grants.approves.length > 0 || Object.values(me.grants.agents).includes("run") || isAdmin(me);

export const canViewTaskPrs = (me: Me) => canReadAgent(me, "qa-agent");

export const worksInVsCode = (me: Me) => canRunAgent(me, "vscode-agent");
