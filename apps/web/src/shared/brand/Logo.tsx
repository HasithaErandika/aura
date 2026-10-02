import type { ImgHTMLAttributes, HTMLAttributes } from "react";

export function LogoMark({ className, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/aura-mark.png" alt={alt} className={className} {...props} />;
}

export function LogoWordmark({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`} {...props}>
      AURA
    </span>
  );
}

export function LogoWordmarkImage({ className, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/aura-text.png" alt={alt} className={className} {...props} />;
}
