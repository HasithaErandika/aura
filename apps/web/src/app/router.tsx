import { Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { paths } from "./paths.ts";
import { RequireAuth, RequireRole } from "../shared/auth/guards.tsx";
import { AppShell } from "../shared/layout/AppShell.tsx";
import { Spinner } from "../shared/ui/Spinner.tsx";

import {
  ApprovalDetailPage,
  AuditPage,
  DashboardPage,
  DesignDocsPage,
  InboxPage,
  JiraPage,
  LandingPage,
  LoginPage,
  RegistryPage,
  RunDetailPage,
  RunsPage,
  UsersPage,
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
      { path: "design-docs", element: page(<DesignDocsPage />), handle: { title: "Design Documents" } },
      { path: "jira", element: page(<JiraPage />), handle: { title: "Jira" } },
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
    ],
  },
  { path: "*", element: <Navigate to={paths.landing} replace /> },
]);
