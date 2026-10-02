-- AURA - webhook deliveries (docs/plans/aura-git-control-plane.md step 3.1).
--
-- GitHub and Jira send events to POST /webhooks/github and /webhooks/jira. Both retry, and
-- GitHub's "Redeliver" re-sends the same delivery id, so every accepted delivery is claimed here
-- first: a repeat hits the unique key and is answered without being handled twice. When handling
-- fails the claim is removed, so the sender's retry is handled. Payloads are not stored; the
-- audit log records what was received.

create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  source text not null check (source in ('github', 'jira')),
  delivery_id text not null check (char_length(delivery_id) between 1 and 200),
  event text not null check (char_length(event) between 1 and 100),
  received_at timestamptz not null default now(),
  unique (source, delivery_id)
);

create index webhook_deliveries_received_idx on public.webhook_deliveries (received_at desc);

alter table public.webhook_deliveries enable row level security;
-- No policies: only the API (service role) reads and writes deliveries.
