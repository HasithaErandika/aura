import type { ImgHTMLAttributes, HTMLAttributes } from "react";

/**
 * AURA's mark, cropped from the source lockup (public/aura.webp) into its own
 * transparent asset (public/aura-mark.png). Keeps its own gradient, so
 * text-* color classes have no effect here, only sizing.
 */
export function LogoMark({ className, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/aura-mark.png" alt={alt} className={className} {...props} />;
}

/** AURA's wordmark as text, so it reads correctly on any background. */
export function LogoWordmark({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`} {...props}>
      AURA
    </span>
  );
}

/**
 * AURA's wordmark as the source graphic (public/aura-text.png), letters recolored to
 * dark ink so it reads on light backgrounds; the red/pink triangle accents are untouched.
 * Only for light surfaces - on a dark surface use LogoWordmark instead.
 */
export function LogoWordmarkImage({ className, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/aura-text.png" alt={alt} className={className} {...props} />;
}
