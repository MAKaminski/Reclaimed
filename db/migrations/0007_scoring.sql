-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — Expected-value scores and the staff work queue.
--
-- Scores are HISTORY, not overwritten. The priors in lib/scoring/params.ts are
-- explicitly guesses; keeping every score with its params version and verbatim
-- inputs is what makes them correctable from observed outcomes later.
-- ═══════════════════════════════════════════════════════════════════════════

create table property_scores (
  id              bigint generated always as identity primary key,
  property_id     text not null,
  scored_at       timestamptz not null default now(),
  params_version  text not null,

  p_contactable          numeric(6,5) not null check (p_contactable between 0 and 1),
  p_signs                numeric(6,5) not null check (p_signs between 0 and 1),
  p_entitlement_provable numeric(6,5) not null check (p_entitlement_provable between 0 and 1),

  gross_fee_cents      bigint not null,
  expected_cost_cents  bigint not null,
  expected_value_cents bigint not null,
  confidence           numeric(6,5) not null check (confidence between 0 and 1),

  inputs    jsonb not null,
  rationale jsonb not null default '[]'::jsonb
);

create index property_scores_latest_idx on property_scores (property_id, scored_at desc);
create index property_scores_ev_idx     on property_scores (expected_value_cents desc);

comment on table property_scores is
  'Append-only score history. Every row carries the params version and the verbatim inputs so the model can be back-tested against actual outcomes once claims close.';

alter table property_scores enable row level security;
create policy scores_staff_read on property_scores
  for select to authenticated using (is_active_staff());
create policy scores_staff_write on property_scores
  for insert to authenticated
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));

create or replace view property_scores_latest
with (security_invoker = true) as
select distinct on (property_id) *
from property_scores
order by property_id, scored_at desc;

-- EV-ranked staff queue over the priority tier. Every row exposes its score
-- inputs and rationale: a queue a human cannot interrogate cannot be corrected.
create or replace view work_queue
with (security_invoker = true) as
select
  p.property_id, p.owner_name, p.owner_class, p.cash_amount_cents,
  p.naupa_property_type, p.holder_name, p.last_known_city, p.last_known_state,
  p.year_reported, p.enforceable_on, p.priority_reason,
  s.expected_value_cents, s.gross_fee_cents, s.expected_cost_cents,
  s.p_contactable, s.p_signs, s.p_entitlement_provable,
  s.confidence, s.rationale, s.params_version, s.scored_at
from properties_priority p
join property_scores_latest s on s.property_id = p.property_id
where s.expected_value_cents > 0
order by s.expected_value_cents desc;
