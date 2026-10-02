import { Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { paths } from "./paths.ts";
import { RedirectKeepingSearch, RequireAuth, RequireRole } from "../shared/auth/guards.tsx";
import { AppShell } from "../shared/layout/AppShell.tsx";
import { Spinner } from "../shared/ui/Spinner.tsx";

import {
  ApprovalDetailPage,
  AuditPage,
  DashboardPage,
  InboxPage,
  JiraPage,
  LandingPage,
  LoginPage,
  DesignDocsPage,
  QaPage,
  ProfilePage,
  RegistryPage,
  RunDetailPage,
  RunsPage,
  UsersPage,
  ProjectsPage,
  AiUsagePage,
  SettingsPage,
  DeviceApprovalPage,
  WorkspacePage,
} from "./pages.ts";

function page(node: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner label="Loading" />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: paths.landing, element: page(<LandingPage />) },
  { path: paths.login, element: page(<LoginPage />) },
  { path: "/dashboard", element: <Navigate to={paths.dashboard} replace /> },
  { path: "/admin", element: <Navigate to={paths.users} replace /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: page(<DashboardPage />), handle: { title: "Dashboard" } },
      { path: "workspace", element: page(<WorkspacePage />), handle: { title: "Agent Workspace", fullBleed: true } },
      { path: "workspace/:threadId", element: page(<WorkspacePage />), handle: { title: "Agent Workspace", fullBleed: true } },
      { path: "approvals", element: page(<InboxPage />), handle: { title: "Approval Inbox" } },
      { path: "approvals/:id", element: page(<ApprovalDetailPage />), handle: { title: "Approval Inbox" } },
      { path: "runs", element: page(<RunsPage />), handle: { title: "Runs" } },
      { path: "runs/:id", element: page(<RunDetailPage />), handle: { title: "Runs" } },
      { path: "agents", element: page(<RegistryPage />), handle: { title: "Agent Registry" } },
      { path: "design-docs", element: page(<DesignDocsPage />), handle: { title: "Design documents" } },
      { path: "qa", element: page(<QaPage />), handle: { title: "QA" } },
      // Project Files was removed (code is read in VS Code and in the pull request); old links,
      // ?epic= included, land on the documents that replaced it.
      { path: "project-files", element: <RedirectKeepingSearch to={paths.designDocs} /> },
      { path: "dev-files", element: <RedirectKeepingSearch to={paths.designDocs} /> },
      { path: "qa-files", element: <RedirectKeepingSearch to={paths.qa} /> },
      { path: "jira", element: page(<JiraPage />), handle: { title: "Jira" } },
      {
        path: "profile",
        element: (
          <RequireRole roles={["developer"]}>{page(<ProfilePage />)}</RequireRole>
        ),
        handle: { title: "Profile" },
      },
      {
        path: "audit",
        element: (
          <RequireRole roles={["admin"]}>{page(<AuditPage />)}</RequireRole>
        ),
        handle: { title: "Audit Explorer" },
      },
      {
        path: "admin/users",
        element: (
          <RequireRole roles={["admin"]}>{page(<UsersPage />)}</RequireRole>
        ),
        handle: { title: "User Management" },
      },
      {
        path: "admin/projects",
        element: (
          <RequireRole roles={["admin"]}>{page(<ProjectsPage />)}</RequireRole>
        ),
        handle: { title: "Projects & Repositories" },
      },
      {
        path: "admin/ai-usage",
        element: (
          <RequireRole roles={["admin"]}>{page(<AiUsagePage />)}</RequireRole>
        ),
        handle: { title: "AI Usage & Quality" },
      },
      {
        // VS Code device sign-in (apps/vscode): opened from the extension with ?code=.
        path: "device",
        element: (
          <RequireRole roles={["developer"]}>{page(<DeviceApprovalPage />)}</RequireRole>
        ),
        handle: { title: "Sign in to VS Code" },
      },
      {
        path: "admin/settings",
        element: (
          <RequireRole roles={["admin"]}>{page(<SettingsPage />)}</RequireRole>
        ),
        handle: { title: "Settings" },
      },
    ],
  },
  { path: "*", element: <Navigate to={paths.landing} replace /> },
]);
