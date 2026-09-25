import type { SVGProps } from "react";
import { PALETTE } from "./palette.ts";


interface AgentLiveProps extends SVGProps<SVGSVGElement> {
  running?: boolean;
  size?: number | string;
  className?: string;
}

export function AgentLiveIcon({
  running = false,
  size = 32,
  className = "",
  ...props
}: AgentLiveProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 overflow-visible"
        {...props}
      >
        <defs>
          {/* Single light source across the whole gem, top-left to bottom-right,
              so every facet reads as one polished piece instead of six unrelated hues. */}
          <linearGradient
            id="agent-facet"
            x1="18"
            y1="12"
            x2="102"
            y2="108"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={PALETTE[0]} />
            <stop offset="35%" stopColor={PALETTE[1]} />
            <stop offset="65%" stopColor={PALETTE[2]} />
            <stop offset="100%" stopColor={PALETTE[3]} />
          </linearGradient>

          <filter id="agent-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft contact shadow so the gem sits above the surface at rest. */}
          <filter id="agent-shadow" x="-40%" y="-30%" width="180%" height="170%">
            <feDropShadow
              dx="0"
              dy="2.5"
              stdDeviation="3.5"
              floodColor="#0f172a"
              floodOpacity="0.18"
            />
          </filter>
        </defs>

        <g
          filter={running ? "url(#agent-glow)" : "url(#agent-shadow)"}
          className={running ? "animate-pulse-glow" : ""}
          style={{ transformOrigin: "60px 60px" }}
        >
          {/* Outer facets — one shared gradient, thin edge lines to read as a cut gem. */}
          <g stroke="rgba(15,23,42,0.10)" strokeWidth="0.6" strokeLinejoin="round">
            <polygon points="60,12 18,36 41,49 60,38" fill="url(#agent-facet)" />
            <polygon points="60,12 102,36 79,49 60,38" fill="url(#agent-facet)" />
            <polygon points="102,36 102,84 79,71 79,49" fill="url(#agent-facet)" />
            <polygon points="102,84 60,108 60,82 79,71" fill="url(#agent-facet)" />
            <polygon points="60,108 18,84 41,71 60,82" fill="url(#agent-facet)" />
            <polygon points="18,84 18,36 41,49 41,71" fill="url(#agent-facet)" />
          </g>

          {/* Inner facets — same gradient, dimmed to fake interior shadow / depth. */}
          <g opacity="0.8">
            <polygon points="60,38 79,49 60,60" fill="url(#agent-facet)" />
            <polygon points="79,49 79,71 60,60" fill="url(#agent-facet)" />
            <polygon points="79,71 60,82 60,60" fill="url(#agent-facet)" />
            <polygon points="60,82 41,71 60,60" fill="url(#agent-facet)" />
            <polygon points="41,71 41,49 60,60" fill="url(#agent-facet)" />
            <polygon points="41,49 60,38 60,60" fill="url(#agent-facet)" />
          </g>

          {/* Center core, with a calm expanding ring instead of the whole gem strobing. */}
          <circle cx="60" cy="60" r="3" fill="white" opacity={running ? 1 : 0.85} />
          {running ? (
            <circle cx="60" cy="60" r="3" fill="white" opacity="0.55" className="animate-ping" />
          ) : null}
        </g>
      </svg>
    </div>
  );
}
