import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { SearchIcon } from "../icons/index.tsx";
import { Input } from "./Input.tsx";

export function SearchInput({ className, label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
      <Input type="search" aria-label={label} className="h-8 pl-8 text-xs" {...props} />
    </div>
  );
}
