import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { ArrowRightIcon, ChevronRightIcon } from "@/shared/icons/index.tsx";
import { buttonClass } from "@/shared/ui/buttonStyles.ts";
import { INTEGRATIONS } from "../lib/content.ts";
import { AuraNetworkCanvas } from "./AuraNetworkCanvas.tsx";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-surface py-12 lg:py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink-700">
            <span className="size-2 animate-pulse rounded-full bg-brand" aria-hidden />
            AURA delivery platform
          </p>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl sm:leading-[1.12] lg:text-5xl">
            AI agents that ship software. <span className="text-brand">Humans in control.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-ink-600 sm:text-base">
            AURA runs AI agents across your delivery lifecycle. Jira holds the work, and a person approves every step before it happens.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={paths.login} className={buttonClass("primary", "md")}>
              Sign in
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
            <a href="#how-it-works" className={buttonClass("secondary", "md")}>
              See the workflow
              <ChevronRightIcon className="size-4 text-ink-400" aria-hidden />
            </a>
          </div>
          <div className="mt-10 border-t border-line/70 pt-5">
            <p className="text-[10px] font-bold tracking-widest text-ink-400 uppercase">Works with</p>
            <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              {INTEGRATIONS.map(({ label, icon: Icon }) => (
                <li key={label} className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
                  <Icon className="size-3.5 text-ink-400" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <AuraNetworkCanvas />
        </div>
      </div>
    </section>
  );
}
