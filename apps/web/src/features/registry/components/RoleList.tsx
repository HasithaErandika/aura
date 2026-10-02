import type { Role } from "@/shared/lib/roles.ts";
import { roleLabel } from "@/shared/lib/roles.ts";

export function RoleList({ label, roles }: { label: string; roles: Role[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1 text-sm break-words text-ink-700">{roles.length ? roles.map(roleLabel).join(", ") : "Nobody"}</p>
    </div>
  );
}
