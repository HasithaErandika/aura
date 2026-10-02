import { cn } from "../lib/cn.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-dark hover:bg-brand-hover focus-visible:ring-brand/30 disabled:bg-brand/60",
  secondary: "border border-line-strong bg-surface text-ink-800 hover:bg-ink-50 focus-visible:ring-ink-300",
  ghost: "text-ink-700 hover:bg-ink-100 focus-visible:ring-ink-300",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft focus-visible:ring-danger/30",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}
