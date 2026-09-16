import type { ComponentType, SVGProps } from "react";

interface StatCardProps {
  label: string;
  value: string;
  trend: string;
  trendTone: "up" | "down" | "flat";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accent: string;
}

const trendColor: Record<StatCardProps["trendTone"], string> = {
  up: "text-sec-green",
  down: "text-brand-red",
  flat: "text-sec-grey",
};

export function StatCard({ label, value, trend, trendTone, icon: Icon, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-sec-grey">{label}</p>
        <div className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a` }}>
          <Icon className="size-[18px]" style={{ color: accent }} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className={`mt-1 text-xs font-medium ${trendColor[trendTone]}`}>{trend}</p>
    </div>
  );
}
