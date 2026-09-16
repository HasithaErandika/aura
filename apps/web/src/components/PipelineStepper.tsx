import type { Gate, GateStatus } from "../types.ts";
import { CheckIcon } from "./icons.tsx";

const circleStyles: Record<GateStatus, string> = {
  done: "bg-sec-green text-white",
  current: "bg-prism-gold text-white ring-4 ring-prism-gold/25",
  pending: "bg-slate-100 text-sec-grey",
  blocked: "bg-brand-red text-white",
};

const labelStyles: Record<GateStatus, string> = {
  done: "text-slate-700",
  current: "text-slate-900 font-semibold",
  pending: "text-sec-grey",
  blocked: "text-brand-red font-semibold",
};

const lineStyles: Record<GateStatus, string> = {
  done: "bg-sec-green",
  current: "bg-slate-200",
  pending: "bg-slate-200",
  blocked: "bg-slate-200",
};

export function PipelineStepper({ gates }: { gates: Gate[] }) {
  return (
    <div className="flex items-start">
      {gates.map((gate, i) => (
        <div key={gate.label} className={`flex items-center ${i === gates.length - 1 ? "" : "flex-1"}`}>
          <div className="flex flex-col items-center gap-2">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${circleStyles[gate.status]}`}>
              {gate.status === "done" ? <CheckIcon className="size-4" /> : i + 1}
            </div>
            <p className={`w-20 text-center text-[11px] leading-tight ${labelStyles[gate.status]}`}>{gate.label}</p>
          </div>
          {i < gates.length - 1 ? (
            <div className={`mx-1 mt-[-20px] h-0.5 flex-1 rounded-full ${lineStyles[gate.status]}`} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
