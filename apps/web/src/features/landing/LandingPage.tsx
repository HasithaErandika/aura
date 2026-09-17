import { Link } from "react-router-dom";
import { LogoMark, LogoWordmarkImage } from "../../shared/brand/Logo.tsx";
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
} from "../../shared/icons/index.tsx";

const lifecycle = [
  { title: "Epic", description: "The Project Owner defines the objective, scope, and success metrics." },
  { title: "Stories", description: "The Business Analyst writes acceptance criteria and a definition of done." },
  { title: "Architecture", description: "The Architect proposes the technical design and records the decision." },
  { title: "Development", description: "A developer reviews and merges every change; nothing is pushed directly." },
  { title: "Test plan", description: "QA approves the coverage before any suite runs." },
  { title: "Verification", description: "QA confirms the results against the raw evidence." },
  { title: "Release", description: "The Deployer and a second approver sign off before production." },
];

const governance = [
  {
    icon: GateIcon,
    title: "Human in the loop",
    description: "Every consequential action pauses for an approval recorded outside the model, not inside a prompt.",
  },
  {
    icon: AuditIcon,
    title: "Complete audit trail",
    description: "Every run, decision, and artifact is logged and traceable end to end, in order.",
  },
  {
    icon: UsersIcon,
    title: "Role-based access",
    description: "Access to each agent and action is governed by role, evaluated in code, never by the model.",
  },
  {
    icon: TicketIcon,
    title: "Jira stays the source of truth",
    description: "AURA writes back to Jira on approval. It never becomes a second system of record.",
  },
];

const roles = [
  { label: "Project Owner", icon: PersonIcon },
  { label: "Business Analyst", icon: DocumentIcon },
  { label: "Architect", icon: SwapIcon },
  { label: "Developer", icon: CodeIcon },
  { label: "QA Engineer", icon: ClipboardCheckIcon },
  { label: "Tester", icon: SearchIcon },
  { label: "Deployer", icon: CloudIcon },
];

const integrations = [
  { label: "Jira", icon: TicketIcon },
  { label: "Git", icon: GitIcon },
  { label: "CI/CD", icon: InfinityIcon },
  { label: "Governance", icon: GateIcon },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-ink-900">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-auto" />
            <LogoWordmarkImage className="h-5 w-auto" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
              How it works
            </a>
            <a href="#governance" className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
              Governance
            </a>
            <a href="#roles" className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
              Roles
            </a>
          </nav>

          <Link
            to="/login"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-dark transition-colors hover:bg-brand-hover"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">AI delivery platform</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-ink-900 sm:text-5xl">
                AI agents that ship software, with a human in control at every step.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
                AURA coordinates specialised agents across the software delivery lifecycle, uses Jira as the single
                system of record, and gates every consequential action behind a recorded human approval.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Link
                  to="/login"
                  className="flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-on-dark transition-colors hover:bg-brand-hover"
                >
                  Sign in
                  <ArrowRightIcon className="size-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 transition-colors hover:text-ink-900"
                >
                  See how it works
                  <ChevronRightIcon className="size-4" />
                </a>
              </div>

              <div className="mt-14 border-t border-line pt-8">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Built around the tools you already use
                </p>
                <ul className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
                  {integrations.map(({ label, icon: Icon }) => (
                    <li key={label} className="flex items-center gap-2 text-sm font-medium text-ink-500">
                      <Icon className="size-4 text-ink-400" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div id="how-it-works" className="scroll-mt-24 rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold text-ink-900">How AURA works</p>
              <p className="mt-1 text-sm text-ink-500">One pipeline, seven human gates.</p>

              <ol className="relative mt-6 space-y-6">
                <div aria-hidden className="absolute bottom-4 left-[15px] top-4 w-px bg-line" />
                {lifecycle.map((stage, i) => (
                  <li key={stage.title} className="relative flex gap-4">
                    <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-semibold text-ink-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-sm font-semibold text-ink-900">{stage.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{stage.description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-xs font-medium text-ink-500">
                <GateIcon className="size-4 shrink-0 text-brand" />
                Every stage pauses for a recorded human decision before the next one starts.
              </div>
            </div>
          </div>
        </section>

        {/* Governance */}
        <section id="governance" className="scroll-mt-24 border-t border-line bg-canvas">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Governance is not a feature bolted on after</h2>
              <p className="mt-3 text-base leading-relaxed text-ink-600">
                Authorization, approvals, and audit are deterministic systems that sit outside the model, so nothing an
                agent proposes can execute without a person and a record.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {governance.map(({ icon: Icon, title, description }) => (
                <div key={title}>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-ink-900">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Specialised agents for every role</h2>
              <p className="mt-3 text-base leading-relaxed text-ink-600">
                Each agent is scoped to one part of the lifecycle and to the people whose role approves its work.
              </p>
            </div>

            <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {roles.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-3 py-6 text-center transition-colors hover:border-ink-300"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-neutral-soft text-ink-600">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium leading-tight text-ink-700">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA band */}
        <section className="border-y border-line bg-canvas">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-16 text-center lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Sign in to get started</h2>
            <p className="max-w-md text-base text-ink-600">
              Accounts are provisioned by an administrator. There is no public sign-up.
            </p>
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-on-dark transition-colors hover:bg-brand-hover"
            >
              Sign in
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-ink-500 sm:flex-row lg:px-8">
          <p>&copy; {new Date().getFullYear()} AURA, by Dialog.</p>
          <p>Accounts are provisioned by an administrator. There is no public sign-up.</p>
        </div>
      </footer>
    </div>
  );
}
