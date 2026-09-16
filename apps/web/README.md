# AURA — web

Landing page, login, admin (user management), and the agent dashboard (Approval Inbox, Run Console, Agent Registry, Audit Explorer). React + Vite + TypeScript + Tailwind CSS v4, themed with Axiata's Red/Gold/Orange/Red-Orange/Purple/Magenta palette (`src/index.css` — no blue, by brand direction).

## Setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (same Supabase project as `apps/api`) and `VITE_API_URL` (defaults to `http://localhost:4000`).
2. Make sure `apps/api` is set up first (schema applied, at least one admin bootstrapped) — this app has no signup page; accounts come from the Admin screen.
3. `npm install && npm run dev`

## Pages

- `/` — public landing page
- `/login` — email/password sign-in (Supabase Auth), no signup
- `/dashboard` — the agent workspace (auth required)
- `/admin` — user management: create accounts, change roles, deprovision (admin role required)

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc -b`) then production build
- `npm run typecheck` — type-check only
- `npm run lint` — ESLint
- `npm run preview` — preview the production build
