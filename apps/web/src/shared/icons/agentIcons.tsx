import type { ReactElement, SVGProps } from "react";
import { cn } from "../lib/cn.ts";
import { PALETTE } from "./agentLive.tsx";

// One badge per agent for the Agent Registry page, built from the same low-poly "crystal" facets
// and warm palette as agentLive.tsx's running-agent icon, so this reads as the same icon family
// rather than a different visual language - but each agent gets its own facet color rotation plus
// a small center mark hinting at its job, so no two badges look alike. Keyed by the exact ids
// agents/registry.ts's AgentId union uses.

// The six outer facets of the crystal, in position order: top-left, top-right, right,
// bottom-right, bottom-left, left - lifted directly from agentLive.tsx's polygon points.
const OUTER_POINTS = [
  "60,12 18,36 41,49 60,38",
  "60,12 102,36 79,49 60,38",
  "102,36 102,84 79,71 79,49",
  "102,84 60,108 60,82 79,71",
  "60,108 18,84 41,71 60,82",
  "18,84 18,36 41,49 41,71",
];

// The six inner facets, same position order, meeting at the crystal's center.
const INNER_POINTS = [
  "60,38 79,49 60,60",
  "79,49 79,71 60,60",
  "79,71 60,82 60,60",
  "60,82 41,71 60,60",
  "41,71 41,49 60,60",
  "41,49 60,38 60,60",
];

// Renders the crystal with PALETTE colors assigned to facet positions by `order` - each agent
// gets its own rotation of the palette around the six positions, so the same silhouette reads
// as a distinct gem per agent instead of a copy of agentLive's default coloring.
function Crystal({ order }: { order: readonly number[] }) {
  return (
    <g>
      <g stroke="rgba(15,23,42,0.10)" strokeWidth={0.6} strokeLinejoin="round">
        {OUTER_POINTS.map((points, i) => (
          <polygon key={`o${i}`} points={points} fill={PALETTE[order[i]]} />
        ))}
      </g>
      <g opacity={0.8}>
        {INNER_POINTS.map((points, i) => (
          <polygon key={`i${i}`} points={points} fill={PALETTE[order[i]]} />
        ))}
      </g>
    </g>
  );
}

// Orchestrator - a small hub-and-spokes: coordinates several others, never doing the work itself.
function OrchestratorMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2.2} strokeLinecap="round" fill="white">
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

// PO Agent - plants a flag: defines the objective.
function PoMark() {
  return (
    <g transform="translate(60,60) scale(1.5)">
      <path d="M-5,-10 L-5,10" stroke="white" strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M-5,-10 L8,-6 L-5,-2 Z" fill="white" />
    </g>
  );
}

// BA Agent - a short acceptance-criteria list.
function BaMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2} strokeLinecap="round">
      <line x1="-7" y1="-6" x2="7" y2="-6" />
      <line x1="-7" y1="0" x2="4" y2="0" />
      <line x1="-7" y1="6" x2="7" y2="6" />
    </g>
  );
}

// Architect Agent - a drafting compass.
function ArchitectMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M0,-10 L-7,9 M0,-10 L7,9 M-3.3,4 L3.3,4" />
      <circle cx="0" cy="-10" r="1.8" fill="white" stroke="none" />
    </g>
  );
}

// Dev Agent - a terminal prompt.
function DevMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M-6,-7 L2,0 L-6,7" />
      <line x1="0" y1="7" x2="7" y2="7" />
    </g>
  );
}

// Coding Agent - code brackets, for the actual implementation across providers.
function CodingMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M-6,-7 L-12,0 L-6,7" />
      <path d="M6,-7 L12,0 L6,7" />
    </g>
  );
}

// QA Agent - a shield with a checkmark: draws up the test plan.
function QaMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M0,-10 L8,-7 V2 C8,7 5,10 0,12 C-5,10 -8,7 -8,2 V-7 Z" strokeWidth={1.8} />
      <path d="M-4,0 L-1,3 L4,-4" strokeWidth={2.2} />
    </g>
  );
}

// Tester Agent - a flask: actually runs the suite.
function TesterMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M-2,-10 L2,-10" />
      <path d="M-1,-10 V-4 L-6,5 A2.2,2.2 0 0 0 -4,8 H4 A2.2,2.2 0 0 0 6,5 L1,-4 V-10" />
    </g>
  );
}

// Deployer Agent - a rocket: the release, prepared, never claimed as launched for real.
function DeployerMark() {
  return (
    <g transform="translate(60,60) scale(1.5)">
      <path d="M0,-11 C3,-7 4,-2 4,2 L-4,2 C-4,-2 -3,-7 0,-11 Z" fill="white" />
      <path d="M-4,3 L-8,8 M4,3 L8,8" stroke="white" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

// Git workspace tool - a branch node: init/branch/commit against the scaffolded directory.
function GitMark() {
  return (
    <g transform="translate(60,60) scale(1.5)" stroke="white" strokeWidth={2} strokeLinecap="round" fill="white">
      <line x1="-5" y1="-9" x2="-5" y2="9" />
      <path d="M-5,-2 C-5,3 -1,5 5,5" fill="none" />
      <circle cx="-5" cy="-9" r="2" />
      <circle cx="-5" cy="9" r="2" />
      <circle cx="5" cy="5" r="2" />
    </g>
  );
}

interface AgentVariant {
  // A rotation of PALETTE's 6 indices across the 6 facet positions - unique per agent so each
  // crystal's color pattern is distinct, and none reuse agentLive's own default arrangement.
  order: readonly number[];
  Mark: () => ReactElement;
}

const AGENT_VARIANTS: Record<string, AgentVariant> = {
  orchestrator: { order: [1, 5, 4, 3, 2, 0], Mark: OrchestratorMark },
  "po-agent": { order: [5, 4, 3, 2, 0, 1], Mark: PoMark },
  "ba-agent": { order: [4, 3, 2, 0, 1, 5], Mark: BaMark },
  "architect-agent": { order: [3, 2, 0, 1, 5, 4], Mark: ArchitectMark },
  "dev-agent": { order: [2, 0, 1, 5, 4, 3], Mark: DevMark },
  "coding-agent": { order: [2, 3, 4, 5, 1, 0], Mark: CodingMark },
  "qa-agent": { order: [3, 4, 5, 1, 0, 2], Mark: QaMark },
  "tester-agent": { order: [4, 5, 1, 0, 2, 3], Mark: TesterMark },
  "deployer-agent": { order: [5, 1, 0, 2, 3, 4], Mark: DeployerMark },
  "git-tool": { order: [1, 0, 2, 3, 4, 5], Mark: GitMark },
};

const FALLBACK: AgentVariant = {
  order: [0, 2, 4, 1, 3, 5],
  Mark: () => <circle cx="60" cy="60" r="6" fill="white" opacity={0.85} />,
};

export function AgentIcon({ agentId, className, ...props }: { agentId: string } & SVGProps<SVGSVGElement>) {
  const { order, Mark } = AGENT_VARIANTS[agentId] ?? FALLBACK;
  return (
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("shrink-0", className)} {...props}>
      <Crystal order={order} />
      <Mark />
    </svg>
  );
}
