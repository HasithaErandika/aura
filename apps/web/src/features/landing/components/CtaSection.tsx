import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { ArrowRightIcon } from "@/shared/icons/index.tsx";
import { buttonClass } from "@/shared/ui/buttonStyles.ts";

export function CtaSection() {
  return (
    <section className="border-t border-line bg-brand-navy py-16 text-on-dark">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to ship with AURA?</h2>
        <p className="max-w-md text-xs text-ink-300">An administrator creates every account. There is no public sign-up.</p>
        <Link to={paths.login} className={buttonClass("primary", "md")}>
          Sign in
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
