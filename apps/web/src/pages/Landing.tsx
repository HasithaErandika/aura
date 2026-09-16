import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo.tsx";

const pillars = [
  {
    title: "Agents propose, you decide",
    body: "Every AI agent drafts, plans, and codes — but authorization, risk classification, and state transitions stay in deterministic systems, never a prompt.",
    accent: "#C40D42",
  },
  {
    title: "A human gate at every stage",
    body: "Epic, Story, Architecture, Dev, QA, Test, and Release each end in a durable approval step. Nothing ships without a recorded human decision.",
    accent: "#FDB934",
  },
  {
    title: "Full provenance, always",
    body: "Every artifact an agent creates is stamped with its agent version, prompt, model, run, and approver — evidence over assertion, end to end.",
    accent: "#7B1B67",
  },
];

const stages = ["Epic", "Story", "Architecture", "Dev / PR", "QA Plan", "Test Verify", "Release"];

export function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-red text-white">
            <LogoMark className="size-5" />
          </div>
          <div className="leading-tight">
            <span className="block text-lg font-bold tracking-tight">AURA</span>
            <span className="block text-[11px] font-medium text-sec-grey">by Dialog</span>
          </div>
        </div>
        <Link
          to="/login"
          className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-dark"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 px-3 py-1 text-xs font-semibold text-brand-red">
          Enterprise AI Agent Orchestration Platform
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          AI agents that ship software
          <br />
          <span className="text-brand-red">without going off course.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-sec-grey">
          AURA coordinates specialised AI agents — Project Owner, BA, Architect, Developer, QA, Tester,
          Deployer — across your delivery lifecycle. Jira stays the system of record. Every consequential
          action waits on a human.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="rounded-lg bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-dark"
          >
            Sign in to your workspace
          </Link>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50/60 py-14">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-sec-grey">
            One pipeline, seven human gates
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {stages.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700">
                  {stage}
                </span>
                {i < stages.length - 1 ? <span className="text-slate-300">&rarr;</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div
                className="mb-4 flex size-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${p.accent}1a` }}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: p.accent }} />
              </div>
              <h3 className="text-base font-bold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sec-grey">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <p className="text-center text-xs text-sec-grey">
          &copy; {new Date().getFullYear()} AURA. Accounts are provisioned by an administrator — there is no
          public sign-up.
        </p>
      </footer>
    </div>
  );
}
