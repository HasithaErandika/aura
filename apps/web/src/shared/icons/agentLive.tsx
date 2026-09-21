import type { SVGProps } from "react";

export const PALETTE = [
  "#FFB800",
  "#FF6A00",
  "#E91E63",
  "#7B1FA2",
  "#C2185B",
  "#E30613",
];

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
          {/* Very subtle running-state glow */}
          <filter
            id="agent-glow"
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft center illumination */}
          <radialGradient id="agent-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFB800" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#E91E63" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7B1FA2" stopOpacity="0.5" />
          </radialGradient>
        </defs>

        {/* Agent crystal */}
        <g
          filter={running ? "url(#agent-glow)" : undefined}
          className="origin-center"
          style={{
            transformOrigin: "60px 60px",
            transition: "transform 300ms ease",
          }}
        >
          {/* Outer facets */}
          <polygon
            points="60,12 18,36 41,49 60,38"
            fill={PALETTE[0]}
            className={
              running
                ? "animate-pulse [animation-delay:0ms] [animation-duration:2.4s]"
                : ""
            }
          />

          <polygon
            points="60,12 102,36 79,49 60,38"
            fill={PALETTE[1]}
            className={
              running
                ? "animate-pulse [animation-delay:200ms] [animation-duration:2.4s]"
                : ""
            }
          />

          <polygon
            points="102,36 102,84 79,71 79,49"
            fill={PALETTE[5]}
            className={
              running
                ? "animate-pulse [animation-delay:400ms] [animation-duration:2.4s]"
                : ""
            }
          />

          <polygon
            points="102,84 60,108 60,82 79,71"
            fill={PALETTE[4]}
            className={
              running
                ? "animate-pulse [animation-delay:600ms] [animation-duration:2.4s]"
                : ""
            }
          />

          <polygon
            points="60,108 18,84 41,71 60,82"
            fill={PALETTE[3]}
            className={
              running
                ? "animate-pulse [animation-delay:800ms] [animation-duration:2.4s]"
                : ""
            }
          />

          <polygon
            points="18,84 18,36 41,49 41,71"
            fill={PALETTE[2]}
            className={
              running
                ? "animate-pulse [animation-delay:1000ms] [animation-duration:2.4s]"
                : ""
            }
          />

          {/* Inner crystal */}
          <polygon
            points="60,38 79,49 60,60"
            fill={PALETTE[0]}
            opacity="0.9"
          />

          <polygon
            points="79,49 79,71 60,60"
            fill={PALETTE[1]}
            opacity="0.95"
          />

          <polygon
            points="79,71 60,82 60,60"
            fill={PALETTE[5]}
            opacity="0.9"
          />

          <polygon
            points="60,82 41,71 60,60"
            fill={PALETTE[4]}
            opacity="0.95"
          />

          <polygon
            points="41,71 41,49 60,60"
            fill={PALETTE[3]}
            opacity="0.9"
          />

          <polygon
            points="41,49 60,38 60,60"
            fill={PALETTE[2]}
            opacity="0.95"
          />

          {/* Tiny center node — static, not a pinging circle */}
          <circle
            cx="60"
            cy="60"
            r="3"
            fill="white"
            opacity={running ? 1 : 0.8}
          />
        </g>
      </svg>
    </div>
  );
}