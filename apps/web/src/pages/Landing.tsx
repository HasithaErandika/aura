import { Link } from "react-router-dom";
import { LogoMark, LogoWordmarkImage } from "../components/Logo.tsx";
import {
  PersonIcon,
  PeopleIcon,
  DocumentIcon,
  SwapIcon,
  CodeIcon,
  CloudIcon,
  SearchIcon,
  GateIcon,
  TicketIcon,
  GitIcon,
  InfinityIcon,
  SparkleIcon,
  BrainIcon,
  BoltIcon,
  LayersIcon,
  TreeIcon,
  ArrowRightIcon,
} from "../components/icons.tsx";

const ORBIT_START = -90; // top, degrees in screen space (0 = right, 90 = down)
const ORBIT_STEP = 360 / 7;

const orbitAgents = [
  { key: "po", label: "PO", role: "Project Owner", icon: PersonIcon, color: "#8B5CF6" },
  { key: "architect", label: "Architect", role: "System Architect", icon: SwapIcon, color: "#2DD4BF" },
  { key: "dev", label: "Dev", role: "Developer", icon: CodeIcon, color: "#22C55E" },
  { key: "qa", label: "QA", role: "QA Engineer", icon: GateIcon, color: "#F5B400" },
  { key: "tester", label: "Tester", role: "Tester", icon: SearchIcon, color: "#EC4899" },
  { key: "deployer", label: "Deployer", role: "Deployment Engineer", icon: CloudIcon, color: "#6366F1" },
  { key: "ba", label: "BA", role: "Business Analyst", icon: DocumentIcon, color: "#3B82F6" },
].map((agent, i) => ({ ...agent, angle: ORBIT_START + i * ORBIT_STEP }));

function pointOnCircle(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

const tools = [
  { key: "jira", label: "Jira", icon: TicketIcon, color: "#2684FF" },
  { key: "git", label: "Git", icon: GitIcon, color: "#F97316" },
  { key: "cicd", label: "CI/CD", icon: InfinityIcon, color: "#0EA5E9" },
  { key: "ai", label: "AI Tools", icon: SparkleIcon, color: "#C40D42" },
  { key: "audit", label: "Audit", icon: GateIcon, color: "#7B1B67" },
];

const features = [
  {
    key: "agents",
    title: "AI-Powered Agents",
    body: "Specialised agents for every role in the delivery lifecycle.",
    icon: BrainIcon,
  },
  {
    key: "oversight",
    title: "Human Oversight",
    body: "Keep people in control with approval gates and governance.",
    icon: PeopleIcon,
  },
  {
    key: "secure",
    title: "Enterprise Secure",
    body: "Built for compliance, security, and data protection.",
    icon: GateIcon,
  },
  {
    key: "automation",
    title: "End-to-End Automation",
    body: "From idea to deployment, faster and smarter.",
    icon: BoltIcon,
  },
  {
    key: "unified",
    title: "Unified Platform",
    body: "One ecosystem. One workflow. Total visibility.",
    icon: LayersIcon,
  },
];

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-12%] size-[900px] -translate-x-1/2 rounded-full bg-brand-red/[0.07] blur-[140px]" />
        <div className="absolute bottom-[-20%] left-[8%] h-[420px] w-[900px] rounded-full bg-prism-purple/[0.06] blur-[160px]" />
      </div>

      <div className="fixed inset-x-0 top-4 z-30 px-4 lg:px-6">
        <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 rounded-full border border-slate-200 bg-white/80 px-6 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-auto" />
            <LogoWordmarkImage className="h-6 w-auto" />
            <span className="ml-1 hidden border-l border-slate-200 pl-3 text-xs font-medium text-sec-grey sm:inline">
              AI Engineering Platform
            </span>
          </div>

          <Link
            to="/login"
            className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <PersonIcon className="size-4" />
            Sign In
          </Link>
        </header>
      </div>

      <main className="relative z-10 mx-auto max-w-[1440px] px-6 pb-24 pt-28 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1fr_1.15fr]">
          {/* Left: copy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sec-grey">
              Dialog AURA / AI Engineering Platform
            </p>
            <h1 className="mt-5 text-5xl font-extrabold uppercase leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
              Build.
              <br />
              <span className="bg-gradient-to-br from-brand-red via-prism-magenta to-prism-purple bg-clip-text text-transparent">
                Orchestrate.
              </span>
              <br />
              Deliver.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-sec-grey">
              One intelligent platform for the entire software delivery lifecycle.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-red to-brand-red-light px-6 py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgba(196,13,66,0.28)] transition-transform hover:-translate-y-0.5"
              >
                Explore AURA
                <ArrowRightIcon className="size-4" />
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <TreeIcon className="size-4" />
                View Architecture
              </a>
            </div>
          </div>

          {/* Right: orbit diagram */}
          <div id="how-it-works" className="relative mx-auto w-full max-w-[560px] scroll-mt-24">
            {/* Info chips: normal flow above the circle, so they can never overlap a node */}
            <div className="mb-8 hidden flex-wrap items-center justify-center gap-3 md:flex">
              <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <PeopleIcon className="size-4 shrink-0 text-slate-500" />
                <span className="text-xs font-bold text-slate-900">Human in the Loop</span>
                <span className="hidden text-[10px] text-sec-grey lg:inline">
                  Approval &middot; Governance &middot; Control
                </span>
                <GateIcon className="size-3.5 shrink-0 text-sec-green" />
              </div>
              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                {tools.map(({ key, icon: Icon, color, label }) => (
                  <Icon key={key} className="size-4 shrink-0" style={{ color }} aria-label={label} />
                ))}
              </div>
            </div>

            {/* Desktop / tablet: orbit diagram */}
            <div className="relative mx-auto hidden aspect-square w-full md:block">
              <div className="absolute inset-[10%] rounded-full border border-slate-200" />
              <div className="absolute inset-[24%] rounded-full border border-slate-200" />

              <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
                {orbitAgents.map((agent) => {
                  const outer = pointOnCircle(agent.angle, 36);
                  const inner = pointOnCircle(agent.angle, 16);
                  return (
                    <line
                      key={agent.key}
                      x1={inner.x}
                      y1={inner.y}
                      x2={outer.x}
                      y2={outer.y}
                      stroke={agent.color}
                      strokeOpacity={0.55}
                      strokeWidth={0.4}
                      strokeDasharray="1.6 1.6"
                    />
                  );
                })}
              </svg>

              {/* Center: AURA core orchestrator */}
              <div
                className="absolute left-1/2 top-1/2 z-20 flex size-[28%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-brand-red/40 text-center"
                style={{
                  background: "radial-gradient(circle at 50% 35%, rgba(196,13,66,0.45), rgba(10,8,12,0.94) 70%)",
                  boxShadow: "0 12px 45px rgba(196,13,66,0.28)",
                }}
              >
                <LogoMark className="h-7 w-auto" />
                <p className="mt-1.5 text-[11px] font-extrabold tracking-tight text-white">AURA CORE</p>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-brand-red-light">
                  Orchestrator
                </p>
                <span className="mt-1.5 rounded-full border border-brand-red-light/40 px-2 py-0.5 text-[8px] font-bold text-brand-red-light">
                  AI
                </span>
              </div>

              {/* Agent nodes */}
              {orbitAgents.map(({ key, label, role, icon: Icon, color, angle }) => {
                const p = pointOnCircle(angle, 36);
                return (
                  <div
                    key={key}
                    className="absolute z-20 flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    <div
                      className="flex size-14 items-center justify-center rounded-full border-2 bg-white"
                      style={{
                        borderColor: color,
                        boxShadow: `0 6px 20px ${color}40`,
                      }}
                    >
                      <Icon className="size-5" style={{ color }} />
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                      <span className="size-1.5 rounded-full bg-sec-green" />
                      {label}
                    </p>
                    <p className="text-[10px] leading-tight text-sec-grey">{role}</p>
                  </div>
                );
              })}
            </div>

            {/* Mobile fallback: simple list */}
            <div className="mt-8 space-y-3 md:hidden">
              <div className="flex items-center gap-3 rounded-2xl border border-brand-red/20 bg-brand-red/5 p-4">
                <LogoMark className="h-8 w-auto shrink-0" />
                <div>
                  <p className="text-sm font-extrabold text-slate-900">AURA Core Orchestrator</p>
                  <p className="text-xs text-sec-grey">Routes every stage through a human gate</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {orbitAgents.map(({ key, label, role, icon: Icon, color }) => (
                  <div key={key} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                      style={{ borderColor: color, backgroundColor: `${color}14` }}
                    >
                      <Icon className="size-4" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{label}</p>
                      <p className="truncate text-[10px] text-sec-grey">{role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom feature strip */}
        <div
          id="features"
          className="mt-24 grid scroll-mt-24 grid-cols-1 gap-8 border-t border-slate-200 pt-10 sm:grid-cols-2 lg:grid-cols-5"
        >
          {features.map(({ key, title, body, icon: Icon }) => (
            <div key={key} className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand-red" />
              <div>
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-sec-grey">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-200 py-6">
        <p className="text-center text-xs text-sec-grey">
          &copy; {new Date().getFullYear()} AURA, by Dialog. Accounts are provisioned by an administrator. There is
          no public sign-up.
        </p>
      </footer>
    </div>
  );
}
