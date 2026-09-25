import type { ComponentType, SVGProps } from "react";
import type { Role } from "../lib/roles.ts";
import type { Me } from "../../types/api.ts";
import { paths } from "../../app/paths.ts";
import { AuditIcon, ChatIcon, ClipboardCheckIcon, CodeIcon, DashboardIcon, ListIcon, RegistryIcon, SettingsIcon, TicketIcon, UsersIcon } from "../icons/index.tsx";

export interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
  visible: (me: Me) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const hasRunGrant = (me: Me) => Object.values(me.grants.agents).includes("run");
const isAdmin = (me: Me) => me.role === "admin";
const decides = (me: Me) => me.grants.approves.length > 0 || hasRunGrant(me);
// Matches the API's canViewJira: anyone with at least one agent grant, plus admins.
const hasAnyGrant = (me: Me) => Object.keys(me.grants.agents).length > 0 || isAdmin(me);

// Navigation is derived from the grants the API returns for the signed-in role, not from a
// hardcoded role switch, so a grant change in the policy tables shows up here without edits.
export const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: paths.dashboard, icon: DashboardIcon, end: true, visible: () => true }],
  },
  {
    label: "Work",
    items: [
      { label: "Agent Workspace", to: paths.workspace, icon: ChatIcon, visible: hasRunGrant },
      { label: "Approval Inbox", to: paths.approvals, icon: ClipboardCheckIcon, visible: (me) => decides(me) || isAdmin(me) },
      { label: "Runs", to: paths.runs, icon: ListIcon, visible: (me) => decides(me) || isAdmin(me) },
      // Project Files: the Epic's design docs, tests and code in one workspace. Every pipeline role
      // opens it; what each sees and edits inside follows its grants (project-files/access.ts).
      { label: "Project Files", to: paths.projectFiles, icon: CodeIcon, visible: hasAnyGrant },
      { label: "Jira", to: paths.jira, icon: TicketIcon, visible: hasAnyGrant },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Agent Registry", to: paths.registry, icon: RegistryIcon, visible: (me) => Object.keys(me.grants.agents).length > 0 || isAdmin(me) },
      { label: "Profile & Connected Accounts", to: paths.profile, icon: SettingsIcon, visible: (me) => me.role === "developer" },
      { label: "Audit Explorer", to: paths.audit, icon: AuditIcon, visible: isAdmin },
      { label: "User Management", to: paths.users, icon: UsersIcon, visible: isAdmin },
    ],
  },
];

export const ADMIN_ROLES: Role[] = ["admin"];
