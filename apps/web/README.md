# AURA web

React + Vite + TypeScript + Tailwind CSS v4. The human side of the platform: role-aware dashboard, the Agent Workspace (a chat panel over the Orchestrator with inline human gates), the Approval Inbox, run progress, the agent registry, the audit explorer, and admin user management.

## Layout

```
src/
  app/            App, router, route paths
  config/         typed environment
  types/          API contracts shared by every feature
  shared/
    api/          fetch client, SSE reader, Supabase client, error helpers
    auth/         AuthProvider, useAuth, route guards
    layout/       AppShell, Sidebar, Topbar, navigation (derived from grants), runtime status
    ui/           neutral component kit (Button, Card, Table, Badge, Field, Menu, Markdown, ...)
    icons/ brand/ hooks/ lib/
  features/
    landing/ auth/ dashboard/ workspace/ approvals/ runs/ registry/ dev-files/ audit/ admin/users/
```

Each feature owns its API calls (`api.ts`), hooks, and components. Nothing renders placeholder data; every list, count, and status comes from `apps/api`.

## Design rules

- One accent colour (`--color-brand`) for primary actions and the active nav marker. Neutrals everywhere else; green, amber, and red only for state.
- White sidebar, header carries the page title, live runtime status, and the signed-in user with role.
- Navigation is built from the grants the API returns for the role, so a policy change shows up without a code change here.

## Setup

1. Copy `.env.example` to `.env`: Supabase URL and anon key (same project as `apps/api`), `VITE_API_URL`, and `VITE_RUNTIME_STUDIO_URL` for the Mastra Studio link.
2. Make sure `apps/api` is running with both migrations applied and at least one admin bootstrapped. There is no sign-up page.
3. `pnpm install` at the repo root, then `pnpm --filter web dev` (or `make web`).

## Routes

| Path | Who | Screen |
|---|---|---|
| `/` | public | landing |
| `/login` | public | sign in |
| `/app` | signed in | dashboard for the role |
| `/app/workspace`, `/app/workspace/:threadId` | roles with a run grant (PO, BA) | Agent Workspace |
| `/app/approvals`, `/app/approvals/:id` | approver roles, requesters, admin | Approval Inbox and decision screen |
| `/app/runs`, `/app/runs/:id` | requesters, approver roles, admin | runs and step timeline |
| `/app/agents` | any role with a read grant | Agent Registry (live from the runtime) |
| `/app/dev-files` | every pipeline role, admin | Project Files - an Epic's design documents (Architect edits, PO/BA/Architect send feedback) and a Task's code (Developer/Architect/QA/admin; Developer edits), CodeMirror + terminal (Developer). `/app/design-docs` redirects here |
| `/app/audit` | admin | Audit Explorer |
| `/app/admin/users` | admin | User Management |

## Scripts

Run with `pnpm --filter web <script>` from the repo root (or `pnpm <script>` in this folder): `dev`, `build` (typecheck then bundle), `typecheck`, `lint`, `preview`.
