import type { ReactElement, SVGProps } from "react";
import { cn } from "../lib/cn.ts";
import { canonicalAgentId } from "../lib/agents.ts";
import { PALETTE } from "./palette.ts";

const OUTER_POINTS = [
  "60,12 18,36 41,49 60,38",
  "60,12 102,36 79,49 60,38",
  "102,36 102,84 79,71 79,49",
  "102,84 60,108 60,82 79,71",
  "60,108 18,84 41,71 60,82",
  "18,84 18,36 41,49 41,71",
];

const INNER_POINTS = ["60,38 79,49 60,60", "79,49 79,71 60,60", "79,71 60,82 60,60", "60,82 41,71 60,60", "41,71 41,49 60,60", "41,49 60,38 60,60"];

function Crystal({ order }: { order: readonly number[] }) {
  return (
    <g>
      <g stroke="rgba(15,23,42,0.10)" strokeWidth={0.6} strokeLinejoin="round">
        {OUTER_POINTS.map((points, i) => (
          <polygon key={`o${i}`} points={points} fill={PALETTE[order[i]!]} />
        ))}
      </g>
      <g opacity={0.8}>
        {INNER_POINTS.map((points, i) => (
          <polygon key={`i${i}`} points={points} fill={PALETTE[order[i]!]} />
        ))}
      </g>
    </g>
  );
}

const MARK = { transform: "translate(60,60) scale(1.5)", stroke: "white", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function OrchestratorMark() {
  return (
    <g {...MARK} strokeWidth={2.2} fill="white">
      <line x1="0" y1="0" x2="-9" y2="-7" />
      <line x1="0" y1="0" x2="9" y2="-7" />
      <line x1="0" y1="0" x2="0" y2="10" />
      <circle cx="0" cy="0" r="2.6" />
      <circle cx="-9" cy="-7" r="2" />
      <circle cx="9" cy="-7" r="2" />
      <circle cx="0" cy="10" r="2" />
    </g>
  );
}

function PoMark() {
  return (
    <g {...MARK}>
      <path d="M-5,-10 L-5,10" strokeWidth={2.2} />
      <path d="M-5,-10 L8,-6 L-5,-2 Z" fill="white" stroke="none" />
    </g>
  );
}

function BaMark() {
  return (
    <g {...MARK} strokeWidth={2}>
      <line x1="-7" y1="-6" x2="7" y2="-6" />
      <line x1="-7" y1="0" x2="4" y2="0" />
      <line x1="-7" y1="6" x2="7" y2="6" />
    </g>
  );
}

function ArchitectMark() {
  return (
    <g {...MARK} strokeWidth={2.2}>
      <path d="M0,-10 L-7,9 M0,-10 L7,9 M-3.3,4 L3.3,4" />
      <circle cx="0" cy="-10" r="1.8" fill="white" stroke="none" />
    </g>
  );
}

function QaMark() {
  return (
    <g {...MARK}>
      <path d="M0,-10 L8,-7 V2 C8,7 5,10 0,12 C-5,10 -8,7 -8,2 V-7 Z" strokeWidth={1.8} />
      <path d="M-4,0 L-1,3 L4,-4" strokeWidth={2.2} />
    </g>
  );
}

function DeployerMark() {
  return (
    <g {...MARK}>
      <path d="M0,-11 C3,-7 4,-2 4,2 L-4,2 C-4,-2 -3,-7 0,-11 Z" fill="white" stroke="none" />
      <path d="M-4,3 L-8,8 M4,3 L8,8" strokeWidth={2} />
    </g>
  );
}

function VsCodeMark() {
  return (
    <g {...MARK} strokeWidth={2.2}>
      <path d="M-6,-7 L-12,0 L-6,7" />
      <path d="M6,-7 L12,0 L6,7" />
    </g>
  );
}

function PlannerMark() {
  return (
    <g {...MARK} strokeWidth={2}>
      <circle cx="-7" cy="-6" r="1.4" fill="white" stroke="none" />
      <circle cx="-7" cy="0" r="1.4" fill="white" stroke="none" />
      <circle cx="-7" cy="6" r="1.4" fill="white" stroke="none" />
      <line x1="-3" y1="-6" x2="8" y2="-6" />
      <line x1="-3" y1="0" x2="8" y2="0" />
      <line x1="-3" y1="6" x2="5" y2="6" />
    </g>
  );
}

function CoderMark() {
  return (
    <g {...MARK} strokeWidth={2.4}>
      <path d="M-6,-7 L2,0 L-6,7" />
      <line x1="0" y1="7" x2="7" y2="7" />
    </g>
  );
}

function EvaluatorMark() {
  return (
    <g {...MARK} strokeWidth={2.2}>
      <circle cx="-2" cy="-2" r="6" />
      <line x1="2.5" y1="2.5" x2="8" y2="8" />
    </g>
  );
}

function GitMark() {
  return (
    <g {...MARK} strokeWidth={2}>
      <line x1="-5" y1="-9" x2="-5" y2="9" />
      <path d="M-5,-2 C-5,3 -1,5 5,5" />
      <circle cx="-5" cy="-9" r="2" fill="white" />
      <circle cx="-5" cy="9" r="2" fill="white" />
      <circle cx="5" cy="5" r="2" fill="white" />
    </g>
  );
}

function FallbackMark() {
  return <circle cx="60" cy="60" r="6" fill="white" opacity={0.85} />;
}

const VARIANTS: Record<string, { order: readonly number[]; Mark: () => ReactElement }> = {
  orchestrator: { order: [1, 5, 4, 3, 2, 0], Mark: OrchestratorMark },
  "po-agent": { order: [5, 4, 3, 2, 0, 1], Mark: PoMark },
  "ba-agent": { order: [4, 3, 2, 0, 1, 5], Mark: BaMark },
  "architect-agent": { order: [3, 2, 0, 1, 5, 4], Mark: ArchitectMark },
  "qa-agent": { order: [3, 4, 5, 1, 0, 2], Mark: QaMark },
  "deployer-agent": { order: [5, 1, 0, 2, 3, 4], Mark: DeployerMark },
  "vscode-agent": { order: [2, 3, 4, 5, 1, 0], Mark: VsCodeMark },
  "task-planner": { order: [0, 5, 3, 1, 4, 2], Mark: PlannerMark },
  coder: { order: [2, 0, 1, 5, 4, 3], Mark: CoderMark },
  evaluator: { order: [4, 5, 1, 0, 2, 3], Mark: EvaluatorMark },
  "git-agent": { order: [1, 0, 2, 3, 4, 5], Mark: GitMark },
};

const FALLBACK = { order: [0, 2, 4, 1, 3, 5], Mark: FallbackMark };

export function AgentIcon({ agentId, className, ...props }: { agentId: string } & SVGProps<SVGSVGElement>) {
  const { order, Mark } = VARIANTS[canonicalAgentId(agentId)] ?? FALLBACK;
  return (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} aria-hidden {...props}>
      <Crystal order={order} />
      <Mark />
    </svg>
  );
}
