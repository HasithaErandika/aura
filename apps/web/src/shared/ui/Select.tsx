import type { SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { controlClass } from "./controlStyles.ts";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}
