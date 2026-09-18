import { Link } from "react-router-dom";
import { LogoMark, LogoWordmarkImage } from "../../shared/brand/Logo.tsx";
import { HowAuraWorksDiagram } from "./HowAuraWorksDiagram.tsx";
import { AuraNetworkCanvas } from "./AuraNetworkCanvas.tsx";
import {
  ArrowRightIcon,
  AuditIcon,
  ChevronRightIcon,
  CloudIcon,
  ClipboardCheckIcon,
  CodeIcon,
  DocumentIcon,
  GateIcon,
  GitIcon,
  InfinityIcon,
  PersonIcon,
  SearchIcon,
  SwapIcon,
  TicketIcon,
  UsersIcon,
  BoltIcon,
} from "../../shared/icons/index.tsx";

const principles = [
  {
    num: "01",
    title: "Agents propose; deterministic systems decide",
    description: "Authorization, risk classification, state transitions, test execution, and audit are never delegated to a prompt.",
  },
  {
    num: "02",
    title: "Jira is the work state machine",
    description: "Agents are triggered by Jira status transitions and write back to Jira. AURA never becomes a second project-management system.",
  },
  {
    num: "03",
    title: "Human-in-the-loop is a workflow primitive",
    description: "Every agent stage ends in a durable SUSPENDED_FOR_APPROVAL state; nothing continues without a recorded human decision.",
  },
  {
    num: "04",
    title: "Authorized, validated & bounded tools",
    description: "The LLM cannot call anything the policy engine has not granted for this user, this project, this agent version, this run.",
  },
  {
    num: "05",
    title: "Evidence over assertion",
    description: "An agent may never claim a test passed, a deployment succeeded, or a requirement is met without a machine-generated artifact.",
  },
];

const governanceFeatures = [
  {
    icon: GateIcon,
    title: "Human in the loop",
    description: "Every consequential action pauses for an approval recorded outside the model, not inside a prompt.",
  },
  {
    icon: AuditIcon,
    title: "Complete audit trail",
    description: "Every run, decision, and artifact is logged and traceable end to end, with SHA-256 payload hashes.",
  },
  {
    icon: UsersIcon,
    title: "Role-based access",
    description: "Access to each agent and action is governed by role, evaluated in code outside the LLM.",
  },
  {
    icon: TicketIcon,
    title: "Jira single source of truth",
    description: "AURA writes back to Jira on approval, maintaining Jira as your single system of record.",
  },
];

const roles = [
  { label: "Project Owner", icon: PersonIcon, tier: "MEDIUM Risk", scope: "Epic Definition & Scope" },
  { label: "Business Analyst", icon: DocumentIcon, tier: "MEDIUM Risk", scope: "User Stories & Gherkin AC" },
  { label: "Architect", icon: SwapIcon, tier: "MEDIUM Risk", scope: "System Design & ADRs" },
  { label: "Developer", icon: CodeIcon, tier: "MEDIUM/HIGH Risk", scope: "Sandbox Code & PR Merges" },
  { label: "QA Engineer", icon: ClipboardCheckIcon, tier: "LOW Risk", scope: "Test Plans & Playwright Specs" },
  { label: "Tester", icon: SearchIcon, tier: "LOW Risk", scope: "Result Verification & Defects" },
  { label: "Deployer", icon: CloudIcon, tier: "HIGH Risk (4-Eyes)", scope: "Production Release & Rollback" },
];

const integrations = [
  { label: "Jira Cloud / DC", icon: TicketIcon },
  { label: "GitHub / GitLab", icon: GitIcon },
  { label: "CI/CD Pipelines", icon: InfinityIcon },
  { label: "Policy Engine", icon: GateIcon },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink-900 selection:bg-brand selection:text-on-dark font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-auto" />
            <LogoWordmarkImage className="h-5 w-auto" />
            <span className="hidden sm:inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-brand uppercase border border-brand/20">
              Enterprise Platform
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-xs font-semibold uppercase tracking-wider text-ink-600 transition-colors hover:text-brand">
              How it works
            </a>
            <a href="#principles" className="text-xs font-semibold uppercase tracking-wider text-ink-600 transition-colors hover:text-brand">
              Architecture
            </a>
            <a href="#governance" className="text-xs font-semibold uppercase tracking-wider text-ink-600 transition-colors hover:text-brand">
              Governance
            </a>
            <a href="#roles" className="text-xs font-semibold uppercase tracking-wider text-ink-600 transition-colors hover:text-brand">
              Roles
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-md bg-brand px-4 py-2 text-xs font-bold text-on-dark transition-all hover:bg-brand-hover shadow-sm"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO SECTION: Minimal Text Left, 3D Agent Network Canvas Right */}
        <section className="relative overflow-hidden border-b border-line bg-surface pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Left Column: Clean & Minimal Professional Typography */}
              <div className="lg:col-span-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink-700">
                  <span className="size-2 rounded-full bg-brand animate-pulse" />
                  AURA Enterprise Platform
                </div>

                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl sm:leading-[1.12]">
                  AI agents that ship software.{" "}
                  <span className="text-brand">
                    Humans in control.
                  </span>
                </h1>

                <p className="mt-5 text-sm text-ink-600 leading-relaxed sm:text-base">
                  AURA coordinates specialized AI agents across your software delivery lifecycle, using Jira as the single system of record and gating every consequential action behind a recorded human approval.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    to="/login"
                    className="flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-xs font-bold text-on-dark transition-all hover:bg-brand-hover shadow-sm"
                  >
                    Sign in to Workspace
                    <ArrowRightIcon className="size-4" />
                  </Link>

                  <a
                    href="#how-it-works"
                    className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-4 py-3 text-xs font-semibold text-ink-700 transition-colors hover:bg-canvas"
                  >
                    Explore Workflow
                    <ChevronRightIcon className="size-4 text-ink-400" />
                  </a>
                </div>

                {/* Minimal Integrations Row */}
                <div className="mt-10 border-t border-line/70 pt-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">
                    Enterprise Integrations
                  </p>
                  <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                    {integrations.map(({ label, icon: Icon }) => (
                      <li key={label} className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
                        <Icon className="size-3.5 text-ink-400" />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right Column: 3D Agent Network Particle Canvas */}
              <div className="lg:col-span-7">
                <AuraNetworkCanvas />
              </div>
            </div>
          </div>
        </section>

        {/* HOW AURA WORKS SECTION — Live Interactive Diagram Workflow */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-line bg-canvas py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <HowAuraWorksDiagram />
          </div>
        </section>

        {/* ARCHITECTURAL PRINCIPLES SECTION */}
        <section id="principles" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand">
                <BoltIcon className="size-4 text-brand-orange" />
                Architectural Foundation
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                The Five Non-Negotiable Principles of AURA
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                AURA is built on strict architectural boundaries defined in <code className="text-brand font-mono text-xs bg-brand-soft px-1.5 py-0.5 rounded">ARCHITECTURE.md</code> to guarantee safety and compliance.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {principles.map((p) => (
                <div
                  key={p.num}
                  className="relative rounded-xl border border-line bg-canvas p-6 shadow-sm transition-all hover:border-brand/30"
                >
                  <span className="text-2xl font-black text-brand-orange/40">{p.num}</span>
                  <h3 className="mt-2 text-base font-bold text-ink-900">{p.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GOVERNANCE & ACCESS CONTROL */}
        <section id="governance" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                Governance is not a feature bolted on after
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Authorization, approvals, and audit are deterministic systems that sit outside the model. Nothing an agent proposes can execute without a person and an audit record.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {governanceFeatures.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-xl border border-line bg-canvas p-5 shadow-sm">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AGENT ROLES MATRIX */}
        <section id="roles" className="scroll-mt-20 border-t border-line bg-canvas py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                Specialized Agents for Every Lifecycle Role
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Each agent is strictly scoped to its discipline and to the team members whose role approves its work.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {roles.map(({ label, icon: Icon, tier, scope }) => (
                <div
                  key={label}
                  className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-brand/30"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-canvas text-brand border border-line">
                        <Icon className="size-4" />
                      </span>
                      <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[10px] font-bold text-brand border border-brand/20">
                        {tier}
                      </span>
                    </div>

                    <h3 className="mt-3 text-sm font-bold text-ink-900">{label}</h3>
                    <p className="mt-0.5 text-xs text-ink-500">{scope}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-brand">
                    <span>Gate Approval Required</span>
                    <ChevronRightIcon className="size-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA BAND */}
        <section className="border-t border-line bg-brand-navy py-16 text-on-dark">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-6 text-center lg:px-8">
            <span className="rounded-full bg-brand-soft/15 px-3 py-1 text-xs font-semibold text-brand-orange border border-brand-orange/30">
              Enterprise Security & Governance
            </span>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to ship software with AURA?
            </h2>
            <p className="max-w-md text-xs text-ink-300">
              Accounts are provisioned by an enterprise platform administrator with SAML / OIDC SSO federation.
            </p>
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-xs font-bold text-on-dark transition-all hover:bg-brand-hover shadow-md"
            >
              Sign in to Workspace
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-ink-500 sm:flex-row lg:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-auto" />
            <span className="font-bold text-ink-900">&copy; {new Date().getFullYear()} AURA</span>
            <span>: Enterprise AI Agent Orchestration Platform.</span>
          </div>
          <p>Single source of truth: Jira Cloud / DC.</p>
        </div>
      </footer>
    </div>
  );
}
