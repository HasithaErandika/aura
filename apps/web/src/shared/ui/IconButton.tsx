import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

const tones = {
  neutral: "text-ink-400 hover:bg-ink-100 hover:text-ink-700",
  success: "text-success hover:bg-success-soft",
  danger: "text-ink-400 hover:bg-danger-soft hover:text-danger",
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: ReactNode;
  tone?: keyof typeof tones;
}

export function IconButton({ label, icon, tone = "neutral", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 disabled:opacity-50", tones[tone], className)}
      {...props}
    >
      {icon}
    </button>
  );
}
