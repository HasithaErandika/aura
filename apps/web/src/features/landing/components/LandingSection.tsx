import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn.ts";

export function LandingSection({ id, tone = "surface", children }: { id?: string; tone?: "surface" | "canvas"; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-20 border-t border-line py-14 sm:py-20", tone === "surface" ? "bg-surface" : "bg-canvas")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
