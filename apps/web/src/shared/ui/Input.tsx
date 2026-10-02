import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { controlClass } from "./controlStyles.ts";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, "h-9", className)} {...props} />;
}
