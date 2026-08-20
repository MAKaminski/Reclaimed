-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Chain evaluation and the § 44-12-220(i) heir affidavit path.
--
-- NOTE: chain_submittable() and heir_claim_ready() are superseded by 0011,
-- which fixes a `text[] || 'literal'` ambiguity. Applied here first for
-- historical fidelity; 0011 is the operative definition.
-- ═══════════════════════════════════════════════════════════════════════════

create table chain_thresholds (
  id                    boolean primary key default true check (id),
  minimum_confidence    numeric(4,3) not null default 0.750,
  updated_by            uuid references staff (id),
  updated_at            timestamptz not null default now()
);
insert into chain_thresholds (id) values (true) on conflict do nothing;

alter table chain_thresholds enable row level security;
create policy thresholds_staff_read on chain_thresholds
  for select to authenticated using (is_active_staff());
create policy thresholds_admin_write on chain_thresholds
  for all to authenticated
  using (has_staff_role(array['admin']::staff_role[]))
  with check (has_staff_role(array['admin']::staff_role[]));

-- Chain confidence is the MINIMUM of its links. One weak link is a weak chain.
create or replace view authority_chain_state
with (security_invoker = true) as
select
  l.property_id,
  count(*) as link_count,
  min(l.confidence) as chain_confidence,
  min(l.confidence) filter (where l.review_status = 'reviewed') as reviewed_confidence,
  count(*) filter (where l.review_status = 'rejected') as rejected_links,
  count(*) filter (where l.review_status = 'asserted') as unreviewed_links,
  bool_and(l.evidence_document_id is not null) as every_link_evidenced,
  bool_or(e.invalidated_at is not null) as has_invalidated_evidence,
  bool_or(ent.status is not null and ent.status <> 'active') as requires_manual_review,
  array_agg(distinct ent.status::text) filter (where ent.status is not null) as entity_statuses,
  max(l.sequence) as max_sequence,
  (max(l.sequence) = count(*)) as sequence_contiguous
from authority_links l
join evidence_documents e on e.id = l.evidence_document_id
left join entities ent on ent.id = l.entity_id
group by l.property_id;

create table heir_claims (
  id                  uuid primary key default gen_random_uuid(),
  property_id         text not null,
  decedent_name       text not null,
  date_of_death       date,
  death_certificate_id uuid references evidence_documents (id),
  testate             boolean,
  will_document_id    uuid references evidence_documents (id),
  no_probate_pending  boolean not null default false,
  no_probate_ever_filed boolean not null default false,
  funeral_and_claims_paid boolean not null default false,
  amicable_division   boolean not null default false,
  affidavit_document_id uuid references evidence_documents (id),
  aggregate_value_cents bigint,
  created_by          uuid not null references staff (id),
  created_at          timestamptz not null default now()
);

comment on table heir_claims is
  'SB 403 44-12-220(i) affidavit path. Recipients are personally liable to estate creditors up to the value received, so the completeness gate is not a formality.';

create table heirs (
  id             uuid primary key default gen_random_uuid(),
  heir_claim_id  uuid not null references heir_claims (id) on delete restrict,
  full_name      text not null,
  -- 44-12-192(7.1): adult surviving spouse, child, parent, or sibling.
  relationship   text not null check (relationship in ('spouse','child','parent','sibling')),
  is_adult       boolean not null default true,
  has_signed     boolean not null default false,
  signed_at      timestamptz,
  identity_document_id uuid references evidence_documents (id),
  created_at     timestamptz not null default now()
);

alter table heir_claims enable row level security;
alter table heirs enable row level security;
create policy heir_claims_staff_read on heir_claims
  for select to authenticated using (is_active_staff());
create policy heir_claims_staff_write on heir_claims
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));
create policy heirs_staff_read on heirs
  for select to authenticated using (is_active_staff());
create policy heirs_staff_write on heirs
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));
