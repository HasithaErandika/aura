-- AURA - the Epic's API contract (docs/plans/aura-git-control-plane.md step 3.5).
--
-- The Architect writes one OpenAPI 3.1 contract per Epic at Gate 3, stored and versioned like the
-- other design documents (migration 0010). apps/api checks it on every save; coders build against
-- it, QA scenarios name its operationIds, and Gate 6 commits it to contracts/openapi.yaml.

alter table public.design_documents drop constraint design_documents_kind_check;
alter table public.design_documents
  add constraint design_documents_kind_check check (kind in ('architecture', 'srs', 'plan', 'adr', 'openapi', 'qa-plan', 'qa-scenario'));
