import type { SVGProps } from "react";

/**
 * AURA's mark: a core with two radiating rings, a halo/glow, not a
 * monogram. Renders in `currentColor` so callers control the color via
 * text-* classes, same as the icon set.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      <circle cx="12" cy="12" r="6.4" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.6" />
    </svg>
  );
}
