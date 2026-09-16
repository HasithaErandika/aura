import { AppLayout } from "../components/AppLayout.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { PipelineStepper } from "../components/PipelineStepper.tsx";
import { ApprovalInbox } from "../components/ApprovalInbox.tsx";
import { AgentRegistry } from "../components/AgentRegistry.tsx";
import { DashboardIcon, InboxIcon, AuditIcon, RunIcon } from "../components/icons.tsx";
import type { AgentSummary, ApprovalRequest, Gate } from "../types.ts";

const gates: Gate[] = [
  { label: "Epic", status: "done" },
  { label: "Story", status: "done" },
  { label: "Architecture", status: "done" },
  { label: "Dev / PR", status: "current" },
  { label: "QA Plan", status: "pending" },
  { label: "Test Verify", status: "pending" },
  { label: "Release", status: "pending" },
];

const approvalRequests: ApprovalRequest[] = [
  {
    id: "1",
    issueKey: "AURA-42",
    title: "Approve Epic: Real-time fraud scoring for card payments",
    role: "Project Owner",
    requestedBy: "PO Agent v1.2",
    risk: "LOW",
    waitingSince: "12m ago",
  },
  {
    id: "2",
    issueKey: "AURA-58",
    title: "Approve Stories: Merchant settlement reconciliation",
    role: "Business Analyst",
    requestedBy: "BA Agent v1.4",
    risk: "MEDIUM",
    waitingSince: "41m ago",
  },
  {
    id: "3",
    issueKey: "AURA-61",
    title: "Approve production deploy: payments-api v2.3.0",
    role: "Deployer + second approver",
    requestedBy: "Deployer Agent v1.0",
    risk: "HIGH",
    waitingSince: "1h 20m ago",
  },
];

const agents: AgentSummary[] = [
  { name: "PO Agent", version: "1.2.0", status: "ACTIVE", rejectionRate: "3.1%" },
  { name: "BA Agent", version: "1.4.0", status: "ACTIVE", rejectionRate: "5.4%" },
  { name: "Architect Agent", version: "2.3.1", status: "ACTIVE", rejectionRate: "2.0%" },
  { name: "QA Agent", version: "1.1.0", status: "CANARY", rejectionRate: "8.7%" },
  { name: "Deployer Agent", version: "1.0.0", status: "ACTIVE", rejectionRate: "0.6%" },
];

export function Dashboard() {
  return (
    <AppLayout title="Dashboard" subtitle="AURA by Dialog">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending Approvals"
          value="12"
          trend="3 waiting over SLA"
          trendTone="down"
          icon={InboxIcon}
          accent="#FDB934"
        />
        <StatCard
          label="Active Runs"
          value="34"
          trend="+8 vs. yesterday"
          trendTone="up"
          icon={RunIcon}
          accent="#F7941E"
        />
        <StatCard
          label="Gate Rejection Rate"
          value="4.2%"
          trend="down 0.6pt this week"
          trendTone="up"
          icon={DashboardIcon}
          accent="#7B1B67"
        />
        <StatCard
          label="Spend This Month"
          value="$2,480"
          trend="62% of budget used"
          trendTone="flat"
          icon={AuditIcon}
          accent="#C40D42"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Delivery Pipeline &middot; AURA-58</h2>
            <p className="text-xs text-sec-grey">Merchant settlement reconciliation</p>
          </div>
          <span className="rounded-full bg-prism-gold/20 px-2.5 py-1 text-xs font-semibold text-[#96700d]">
            Awaiting human review
          </span>
        </div>
        <PipelineStepper gates={gates} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ApprovalInbox requests={approvalRequests} />
        </div>
        <AgentRegistry agents={agents} />
      </div>
    </AppLayout>
  );
}
