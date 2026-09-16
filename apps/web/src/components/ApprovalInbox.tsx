import type { ApprovalRequest, RiskTier } from "../types.ts";

const riskStyles: Record<RiskTier, string> = {
  LOW: "bg-sec-green/15 text-sec-green",
  MEDIUM: "bg-prism-gold/20 text-[#96700d]",
  HIGH: "bg-brand-red/10 text-brand-red",
};

export function ApprovalInbox({ requests }: { requests: ApprovalRequest[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Approval Inbox</h2>
          <p className="text-xs text-sec-grey">Waiting on your decision</p>
        </div>
        <button type="button" className="text-xs font-semibold text-brand-red hover:underline">
          View all
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {requests.map((req) => (
          <li key={req.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                  {req.issueKey}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${riskStyles[req.risk]}`}>
                  {req.risk}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-medium text-slate-800">{req.title}</p>
              <p className="text-xs text-sec-grey">
                {req.role} &middot; requested by {req.requestedBy} &middot; {req.waitingSince}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reject
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-red-dark"
              >
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
