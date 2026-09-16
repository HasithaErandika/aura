# AURA — api

Express + TypeScript API: Supabase-backed auth/RBAC, health check, and stubbed run/approval endpoints.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/0001_identity.sql`](supabase/migrations/0001_identity.sql) — see [`supabase/README.md`](supabase/README.md) for what it creates and why the schema stops there for now.
3. Copy `.env.example` to `.env` and fill in your project's URL, anon key, and **service role** key (Project Settings → API). The service role key is server-only — never send it to the browser.
4. `npm install`
5. Create the first admin account (there is no self-serve signup):
   ```bash
   npm run bootstrap-admin -- --email you@company.com --name "Your Name" --password "a-strong-password"
   ```
6. `npm run dev` — listens on `:4000` by default.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness check |
| `GET /me` | any signed-in user | current user's profile + role |
| `GET /users` | admin | list every account and its role |
| `POST /users` | admin | provision a new account (no public signup) |
| `PATCH /users/:id/role` | admin | change a user's role |
| `DELETE /users/:id` | admin | deprovision an account |
| `POST /runs`, `POST /approvals/:id/decide` | — | stubs for the agent-run/approval flow (§4.3 of the architecture) |

Auth: the web app signs in directly against Supabase and sends the resulting access token as `Authorization: Bearer <token>`; this API verifies it with the service-role client and loads the caller's role from `profiles`.
