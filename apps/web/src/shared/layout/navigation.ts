import type { ComponentType, SVGProps } from "react";
import { paths } from "@/app/paths.ts";
import type { Me } from "../api/types.ts";
import { canUseWorkspace, hasAnyGrant, isAdmin, takesPartInRuns, worksInVsCode } from "../lib/access.ts";
import { AuditIcon, BoltIcon, ChatIcon, ClipboardCheckIcon, DashboardIcon, DocumentIcon, GitIcon, ListIcon, RegistryIcon, SettingsIcon, TicketIcon, UsersIcon } from "../icons/index.tsx";

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

export const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: paths.dashboard, icon: DashboardIcon, end: true, visible: () => true }],
  },
  {
    label: "Work",
    items: [
      { label: "Agent Workspace", to: paths.workspace, icon: ChatIcon, visible: canUseWorkspace },
      { label: "Approval Inbox", to: paths.approvals, icon: ClipboardCheckIcon, visible: takesPartInRuns },
      { label: "Runs", to: paths.runs, icon: ListIcon, visible: takesPartInRuns },
      { label: "Design documents", to: paths.designDocs, icon: DocumentIcon, visible: hasAnyGrant },
      { label: "QA", to: paths.qa, icon: ClipboardCheckIcon, visible: hasAnyGrant },
      { label: "Jira", to: paths.jira, icon: TicketIcon, visible: hasAnyGrant },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Agent Registry", to: paths.registry, icon: RegistryIcon, visible: hasAnyGrant },
      { label: "Profile & Access Tokens", to: paths.profile, icon: SettingsIcon, visible: worksInVsCode },
      { label: "Audit Explorer", to: paths.audit, icon: AuditIcon, visible: isAdmin },
      { label: "User Management", to: paths.users, icon: UsersIcon, visible: isAdmin },
      { label: "Projects & Repositories", to: paths.projects, icon: GitIcon, visible: isAdmin },
      { label: "AI Usage & Quality", to: paths.aiUsage, icon: BoltIcon, visible: isAdmin },
      { label: "Settings", to: paths.settings, icon: SettingsIcon, visible: isAdmin },
    ],
  },
];

export function visibleNavigation(me: Me): NavGroup[] {
  return navigation.map((group) => ({ ...group, items: group.items.filter((item) => item.visible(me)) })).filter((group) => group.items.length > 0);
}
