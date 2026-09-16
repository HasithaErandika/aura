import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo.tsx";
import { GateIcon, TicketIcon } from "../components/icons.tsx";

const agents = [
  {
    id: "po",
    name: "Project Owner",
    short: "PO",
    description: "Frames the business outcome",
    color: "#C40D42",
  },
  {
    id: "ba",
    name: "Business Analyst",
    short: "BA",
    description: "Turns intent into requirements",
    color: "#EE3E80",
  },
  {
    id: "architect",
    name: "Architect",
    short: "ARCH",
    description: "Defines the technical approach",
    color: "#7B1B67",
  },
  {
    id: "developer",
    name: "Developer",
    short: "DEV",
    description: "Builds and opens the PR",
    color: "#F15A22",
  },
  {
    id: "qa",
    name: "QA",
    short: "QA",
    description: "Defines verification strategy",
    color: "#F7941E",
  },
  {
    id: "tester",
    name: "Tester",
    short: "TEST",
    description: "Verifies acceptance criteria",
    color: "#FDB934",
  },
  {
    id: "deployer",
    name: "Deployer",
    short: "REL",
    description: "Promotes approved changes",
    color: "#8FB82B",
  },
];

function Arrow() {
  return (
    <div className="flex h-7 w-full items-center justify-center">
      <div className="relative h-full w-px bg-slate-300">
        <span className="absolute -bottom-0.5 left-1/2 size-1.5 -translate-x-1/2 rotate-45 border-b border-r border-slate-400" />
      </div>
    </div>
  );
}

function ApprovalGate() {
  return (
    <div className="group relative flex shrink-0 flex-col items-center">
      <div className="absolute -top-5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Human gate
      </div>

      <div className="flex size-9 items-center justify-center rounded-full border border-slate-300 bg-white shadow-sm transition-all group-hover:border-brand-red group-hover:shadow-md">
        <GateIcon className="size-4 text-slate-500 group-hover:text-brand-red" />
      </div>
    </div>
  );
}

function AgentNode({
  agent,
  compact = false,
}: {
  agent: (typeof agents)[number];
  compact?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] ${
        compact ? "p-3" : "p-3.5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-extrabold tracking-tight"
          style={{
            color: agent.color,
            backgroundColor: `${agent.color}12`,
            border: `1px solid ${agent.color}25`,
          }}
        >
          {agent.short}
        </div>

        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">
            {agent.name}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            {agent.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: agent.color }}
        />
        AI agent
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-[#FAFBFC] text-slate-900">
      {/* Background architecture grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e9edf2 1px, transparent 1px),
            linear-gradient(to bottom, #e9edf2 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, black 15%, transparent 85%)",
        }}
      />

      <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-7 py-5 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-red text-white shadow-sm">
            <LogoMark className="size-5" />
          </div>

          <div className="leading-none">
            <span className="block text-[17px] font-extrabold tracking-[-0.02em]">
              AURA
            </span>
            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              by Dialog
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-semibold text-slate-500 backdrop-blur sm:flex">
            <span className="size-1.5 rounded-full bg-sec-green" />
            Enterprise orchestration
          </div>

          <Link
            to="/login"
            className="rounded-lg bg-brand-red px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-brand-red-dark hover:shadow-md"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[1440px] flex-col px-7 pb-12 lg:px-10">
        {/* Hero copy */}
        <section className="pt-4 lg:pt-6">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
              <span className="size-1.5 rounded-full bg-brand-red" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                AI delivery orchestration
              </span>
            </div>

            <h1 className="max-w-3xl text-[38px] font-extrabold leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-[46px] lg:text-[52px]">
              AI agents do the work.
              <br />
              <span className="text-brand-red">Humans control the outcome.</span>
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 lg:text-[15px]">
              AURA coordinates specialised AI agents across the software
              delivery lifecycle, with a recorded human approval gate before
              every consequential action.
            </p>
          </div>
        </section>

        {/* Architecture diagram */}
        <section className="relative mt-7">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_45px_rgba(15,23,42,0.06)] backdrop-blur-sm lg:p-5">
            {/* Diagram header */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-red">
                  System architecture
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  Agent → Human Gate → Artifact → Next Stage
                </p>
              </div>

              <div className="hidden items-center gap-4 text-[9px] font-semibold text-slate-400 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-brand-red" />
                  Agent execution
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full border border-slate-400 bg-white" />
                  Human decision
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px] bg-slate-200" />
                  Jira artifact
                </span>
              </div>
            </div>

            {/* Desktop architecture */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-[1fr_170px_1fr] items-stretch gap-5">
                {/* Left: agent execution */}
                <div className="flex flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Agent layer
                    </span>
                    <span className="rounded-md bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-400">
                      7 specialised agents
                    </span>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5">
                    {agents.slice(0, 4).map((agent) => (
                      <AgentNode key={agent.id} agent={agent} />
                    ))}
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                    {agents.slice(4).map((agent) => (
                      <AgentNode key={agent.id} agent={agent} compact />
                    ))}
                  </div>
                </div>

                {/* Center: AURA control plane */}
                <div className="relative flex flex-col items-center justify-center">
                  <div className="absolute left-1/2 top-0 h-full w-px border-l border-dashed border-slate-200" />

                  <div className="relative z-10 w-full rounded-2xl border border-brand-red/20 bg-white p-4 shadow-[0_8px_30px_rgba(196,13,66,0.08)]">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-brand-red text-white">
                        <LogoMark className="size-5" />
                      </div>

                      <span className="rounded-full bg-sec-green/20 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-[#5c6b14]">
                        Control plane
                      </span>
                    </div>

                    <p className="text-sm font-extrabold tracking-tight text-slate-950">
                      AURA
                    </p>

                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Orchestrates agents, enforces gates, records decisions.
                    </p>

                    <div className="mt-4 space-y-2">
                      {[
                        "Policy & routing",
                        "Context & memory",
                        "Approval enforcement",
                        "Audit & provenance",
                      ].map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2"
                        >
                          <span className="size-1.5 rounded-full bg-brand-red" />
                          <span className="text-[9px] font-semibold text-slate-600">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Human gate connector */}
                  <div className="relative z-10 my-3 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                    <GateIcon className="size-3.5 text-brand-red" />
                    <span className="text-[9px] font-bold text-slate-600">
                      HUMAN DECISION
                    </span>
                  </div>
                </div>

                {/* Right: record / governance */}
                <div className="flex min-h-0 flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Enterprise record
                    </span>
                    <span className="rounded-md bg-slate-50 px-2 py-1 text-[9px] font-semibold text-slate-400">
                      Immutable context
                    </span>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    {/* Jira */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-[#1868DB]/10">
                          <TicketIcon className="size-5 text-[#1868DB]" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">
                            Jira
                          </p>
                          <p className="text-[9px] font-medium text-slate-400">
                            System of record
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          "Epics",
                          "Stories",
                          "Architecture",
                          "PRs & Tests",
                        ].map((item) => (
                          <div
                            key={item}
                            className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[9px] font-semibold text-slate-500"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Provenance */}
                    <div className="flex flex-1 flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Provenance ledger
                        </p>

                        <div className="mt-3 space-y-2">
                          {[
                            ["Agent version", "v2.4.1"],
                            ["Model", "Enterprise LLM"],
                            ["Run", "aura-8F42"],
                            ["Approver", "Recorded user"],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="flex items-center justify-between border-b border-slate-200/70 pb-2 last:border-0"
                            >
                              <span className="text-[9px] font-medium text-slate-400">
                                {label}
                              </span>
                              <span className="text-[9px] font-bold text-slate-600">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-sec-green/40 bg-sec-green/15 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-sec-green" />
                          <span className="text-[9px] font-bold text-[#5c6b14]">
                            Decision recorded
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tablet / mobile architecture */}
            <div className="lg:hidden">
              <div className="mx-auto max-w-xl">
                <div className="rounded-xl border border-brand-red/20 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-brand-red text-white">
                      <LogoMark className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold">AURA Control Plane</p>
                      <p className="text-[10px] text-slate-400">
                        Orchestration · Policy · Audit · Provenance
                      </p>
                    </div>
                  </div>
                </div>

                <div className="my-3 flex justify-center">
                  <Arrow />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
                      Specialised agents
                    </span>
                    <span className="text-[9px] font-semibold text-brand-red">
                      7 agents
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {agents.map((agent) => (
                      <AgentNode key={agent.id} agent={agent} compact />
                    ))}
                  </div>
                </div>

                <div className="my-3 flex items-center justify-center">
                  <ApprovalGate />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <TicketIcon className="size-5 text-[#1868DB]" />
                    <div>
                      <p className="text-xs font-extrabold">Jira</p>
                      <p className="text-[9px] text-slate-400">
                        System of record · audit trail · delivery artifacts
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom trust strip */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-6">
            {[
              ["7", "human gates"],
              ["100%", "provenance"],
              ["1", "system of record"],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-slate-900">
                  {value}
                </span>
                <span className="text-[9px] font-medium text-slate-400">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <p className="hidden text-[9px] font-medium text-slate-400 sm:block">
            Every consequential action requires a recorded human decision.
          </p>
        </div>
      </main>
    </div>
  );
}

