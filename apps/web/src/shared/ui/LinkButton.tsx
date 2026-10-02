import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./buttonStyles.ts";

export function LinkButton({ to, variant = "secondary", size = "md", icon, children, className }: { to: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
