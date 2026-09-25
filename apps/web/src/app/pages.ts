import { lazy } from "react";

// Each screen is its own chunk; the shell and the sign-in path ship first.
export const LandingPage = lazy(() => import("../features/landing/LandingPage.tsx").then((m) => ({ default: m.LandingPage })));
export const LoginPage = lazy(() => import("../features/auth/LoginPage.tsx").then((m) => ({ default: m.LoginPage })));
export const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage.tsx").then((m) => ({ default: m.DashboardPage })));
export const WorkspacePage = lazy(() => import("../features/workspace/WorkspacePage.tsx").then((m) => ({ default: m.WorkspacePage })));
export const InboxPage = lazy(() => import("../features/approvals/InboxPage.tsx").then((m) => ({ default: m.InboxPage })));
export const ApprovalDetailPage = lazy(() => import("../features/approvals/ApprovalDetailPage.tsx").then((m) => ({ default: m.ApprovalDetailPage })));
export const RunsPage = lazy(() => import("../features/runs/RunsPage.tsx").then((m) => ({ default: m.RunsPage })));
export const RunDetailPage = lazy(() => import("../features/runs/RunDetailPage.tsx").then((m) => ({ default: m.RunDetailPage })));
export const RegistryPage = lazy(() => import("../features/registry/RegistryPage.tsx").then((m) => ({ default: m.RegistryPage })));
export const ProjectFilesPage = lazy(() => import("../features/project-files/ProjectFilesPage.tsx").then((m) => ({ default: m.ProjectFilesPage })));
export const JiraPage = lazy(() => import("../features/jira/JiraPage.tsx").then((m) => ({ default: m.JiraPage })));
export const ProfilePage = lazy(() => import("../features/profile/ProfilePage.tsx").then((m) => ({ default: m.ProfilePage })));
export const AuditPage = lazy(() => import("../features/audit/AuditPage.tsx").then((m) => ({ default: m.AuditPage })));
export const UsersPage = lazy(() => import("../features/admin/users/UsersPage.tsx").then((m) => ({ default: m.UsersPage })));
