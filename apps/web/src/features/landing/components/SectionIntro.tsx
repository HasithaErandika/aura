import type { ReactNode } from "react";

export function SectionIntro({ eyebrow, title, children }: { eyebrow?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-brand uppercase">{eyebrow}</div> : null}
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h2>
      {children ? <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p> : null}
    </div>
  );
}
