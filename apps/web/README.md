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
    landing/ auth/ dashboard/ workspace/ approvals/ runs/ registry/ design-docs/ audit/ admin/users/
```

Each feature owns its API calls (`api.ts`), hooks, and components. Nothing renders placeholder data; every list, count, and status comes from `apps/api`.

## Design rules

- One accent colour (`--color-brand`) for primary actions and the active nav marker. Neutrals everywhere else; green, amber, and red only for state.
- White sidebar, header carries the page title, live runtime status, and the signed-in user with role.
- Navigation is built from the grants the API returns for the role, so a policy change shows up without a code change here.

## Setup

1. Copy `.env.example` to `.env`: Supabase URL and anon key (same project as `apps/api`), `VITE_API_URL`, and `VITE_RUNTIME_STUDIO_URL` for the Mastra Studio link.
2. Make sure `apps/api` is running with both migrations applied and at least one admin bootstrapped. There is no sign-up page.
3. `npm install && npm run dev`

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
| `/app/design-docs` | Architect, admin | Design Documents - browse and view the Architect's per-Epic workspace files (read-only CodeMirror) |
| `/app/audit` | admin | Audit Explorer |
| `/app/admin/users` | admin | User Management |

## Scripts

`npm run dev`, `npm run build` (typecheck then bundle), `npm run typecheck`, `npm run lint`, `npm run preview`.
