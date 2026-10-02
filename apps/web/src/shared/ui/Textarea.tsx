import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { controlClass } from "./controlStyles.ts";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "py-2 leading-relaxed", className)} {...props} />;
}
