import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "../icons/index.tsx";

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900">
      <ArrowLeftIcon className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}
