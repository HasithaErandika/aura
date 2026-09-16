# AURA — database design

This database is deliberately scoped to **identity/RBAC and other plain app functions** — not agent, run, or workflow state. Mastra owns that dynamically in its own storage inside `apps/agent-runtime`; duplicating it here ahead of an actual need would just create two sources of truth. When the API and the agent runtime need to share data, that's a specific design decision to make at the time, not something to scaffold speculatively now.

| File | Creates |
|---|---|
| `0001_identity.sql` | `user_role` enum, `profiles` table (+ RLS), `current_role()` helper |

## What's here

- **`user_role`** — the eight fixed roles from `docs/ARCHITECTURE.md` §4.2 (admin, project_owner, business_analyst, architect, developer, qa_engineer, tester, deployer).
- **`profiles`** — one row per `auth.users` row: email, full name, role. This is the only thing `apps/api`'s auth middleware and `/users` routes read/write.
- **RLS**: a user can read their own row; an admin can read every row. All writes go through the API's service-role client — there is no client-side write policy, so nothing but the API can change a role.

## Growing this schema

Don't add tables here speculatively. When there's an actual need — e.g. the API needs to record something Mastra doesn't already own — add a new `NNNN_description.sql` migration for just that, run after `0001`.
