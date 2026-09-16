import type { AgentStatus, AgentSummary } from "../types.ts";

const statusStyles: Record<AgentStatus, string> = {
  ACTIVE: "bg-sec-green/15 text-sec-green",
  CANARY: "bg-prism-gold/20 text-[#96700d]",
  DRAFT: "bg-slate-100 text-sec-grey",
  DEPRECATED: "bg-brand-red/10 text-brand-red",
};

export function AgentRegistry({ agents }: { agents: AgentSummary[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-900">Agent Registry</h2>
        <p className="text-xs text-sec-grey">Version &amp; quality signal</p>
      </div>

      <ul className="divide-y divide-slate-100">
        {agents.map((agent) => (
          <li key={agent.name} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-medium text-slate-800">{agent.name}</p>
              <p className="text-xs text-sec-grey">v{agent.version}</p>
            </div>
            <div className="text-right">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${statusStyles[agent.status]}`}>
                {agent.status}
              </span>
              <p className="mt-1 text-[11px] text-sec-grey">{agent.rejectionRate} rejection</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
