# AURA api

Express + TypeScript. Owns authentication, the deterministic policy tables, the governance record of every agent run, human approvals, and the audit trail. It is the only service that talks to `apps/agent-runtime`; the browser never reaches the runtime directly.

## Layout

```
src/
  index.ts                 process bootstrap
  app.ts                   express app factory (helmet, cors, json, routes, error handler)
  config/env.ts            typed environment
  lib/                     supabase client, logger, hash, http helpers (errors, sse, validate)
  middleware/              auth (Supabase JWT + profile role), request id, error handler
  modules/
    identity/              roles, /me, /users (admin), profile lookups
    policy/                role -> agent grants and agent -> approver role (data, not prompts)
    runtime/               Mastra HTTP client, SSE parser, message normalizer
    orchestration/         mirrors a runtime stream into runs, steps, approvals
    threads/               conversations (runtime memory) and the SSE message endpoint
    runs/                  run records and step timeline
    approvals/             approval inbox, decide + resume
    audit/                 append-only audit writer and explorer feed
    dashboard/             summary for the signed-in role
    workspace/             read-only proxy onto the Architect's per-Epic design documents
    health/                liveness for the API and the runtime
  routes/index.ts          mounts every module
supabase/migrations/       0001 identity, 0002 runs/approvals/audit, 0003 run_steps 'progress' kind
```

The Orchestrator in the runtime decides the workflow. The API observes its stream (delegations, tool results, `ask_user` pauses) and records what happened; it never encodes a step order. Authorization is the one thing decided here, from two tables in `modules/policy/policy.ts`: who may run an agent and which role answers when the runtime pauses after delegating to an agent.

## Setup

1. Create a Supabase project and run `supabase/migrations/0001_identity.sql`, then `0002_runs_approvals_audit.sql`, then `0003_run_step_progress_kind.sql`, in the SQL editor.
2. Copy `.env.example` to `.env` and fill in the Supabase URL, anon key, service role key, and the runtime URL.
3. `npm install`
4. Create the first admin (no self-serve signup):
   ```bash
   npm run bootstrap-admin -- --email you@company.com --name "Your Name" --password "a-strong-password"
   ```
5. Start `apps/agent-runtime` (`npm run dev` there, port 4111), then `npm run dev` here (port 4000).

## Security controls

- Authentication: Supabase access token on every request. Verified locally (HS256) when `SUPABASE_JWT_SECRET` is set, otherwise via Supabase Auth. Verified sessions are cached for `SESSION_CACHE_TTL_MS` keyed by a hash of the token; a role change or removal invalidates the cache immediately, and a removed account fails the profile lookup even while its token is unexpired.
- Authorization: every grant is data in `modules/policy/policy.ts`, evaluated in code. Admins cannot decide gates. Approval decisions are bound to the snapshot hash the human reviewed.
- Input: strict Zod schemas on bodies and queries (unknown fields rejected), uuid or safe-charset validation on every path id, `256kb` JSON limit.
- Abuse: fixed-window rate limits per client address, per user, and a tighter one on agent turns (`POST /threads/:id/messages`, `POST /approvals/:id/decide`). One agent turn is capped at `RUN_TURN_TIMEOUT_MS`.
- Transport: helmet headers, CORS restricted to `WEB_ORIGIN` with an explicit method and header list, `trust proxy` configured by `TRUST_PROXY_HOPS`.
- Data: RLS enabled with no client policies on governance tables; `audit_logs` is append-only via trigger; `.env` is git-ignored and `.env.example` holds placeholders only.
- Runtime: the browser never reaches the runtime; the API can present `MASTRA_RUNTIME_TOKEN` when the runtime is deployed behind auth.

## Routes

| Route | Who | Purpose |
|---|---|---|
| `GET /health`, `GET /health/runtime` | anyone | API liveness, runtime reachability |
| `GET /me` | signed in | profile, role, and the role's grants |
| `GET/POST /users`, `PATCH /users/:id/role`, `DELETE /users/:id` | admin | account provisioning |
| `GET /agents`, `GET /agents/:id` | signed in | registry as exposed by the runtime, with grants |
| `GET/POST /threads`, `GET /threads/:id/messages`, `DELETE /threads/:id` | run grant | conversations with an agent |
| `POST /threads/:id/messages` | run grant | send a message; responds with an SSE stream of the turn |
| `GET /runs`, `GET /runs/:id` | requester, approver role, admin | run list and step timeline |
| `GET /approvals`, `GET /approvals/:id` | approver role, requester, admin | inbox |
| `POST /approvals/:id/decide` | approver role (or requester for clarifications) | record the decision, resume the run, stream the continuation |
| `GET /audit` | admin | audit explorer feed |
| `GET /dashboard/summary` | signed in | counts, pending decisions, recent runs, runtime status |

### SSE events

`POST /threads/:id/messages` and `POST /approvals/:id/decide` respond with `text/event-stream`:

| event | data |
|---|---|
| `run` | `{ runId, runtimeRunId, status }` |
| `text` | `{ delta }` streamed assistant text |
| `tool` | `{ phase: call\|result\|error, toolName, toolCallId, args?, result?, agent? }` |
| `gate` | `{ approvalId, producingAgent, gate, requiredRole, question, options, selectionMode, snapshot, expiresAt, canDecide }` |
| `decision` | `{ approvalId, status, decision }` (decide endpoint only) |
| `error` | `{ message }` |
| `done` | `{ runId, status, approvalId }` |
