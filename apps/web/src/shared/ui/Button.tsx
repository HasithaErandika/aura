import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Spinner } from "./Spinner.tsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-dark hover:bg-brand-hover focus-visible:ring-brand/30 disabled:bg-brand/60",
  secondary: "border border-line-strong bg-surface text-ink-800 hover:bg-ink-50 focus-visible:ring-ink-300",
  ghost: "text-ink-700 hover:bg-ink-100 focus-visible:ring-ink-300",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft focus-visible:ring-danger/30",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export function Button({ variant = "secondary", size = "md", loading = false, icon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
}
