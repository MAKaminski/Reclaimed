-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — Workability, priority, and the disappearance halt.
--
-- SB 403 (eff. 2026-07-01) § 44-12-220(d.1)(1) has DOR paying sole-owner cash
-- of $500 or less with NO CLAIM FILED AT ALL. Georgia is systematically
-- draining that tier with no finder involvement.
--
-- So the $500 floor is not a preference — it is the DEFINITION of the
-- addressable market. And the real opportunity is what auto-pay CANNOT reach:
-- multi-owner property, entity-owned property, deceased owners and heirs,
-- securities, safe-deposit contents, and any cash above $500.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Holds ──────────────────────────────────────────────────────────────────
-- A disappearance halts everything in flight. Later phases (outreach,
-- agreements, claims) must all check for an active hold before acting.

create type hold_reason as enum (
  'disappeared_from_file',
  'value_changed_materially',
  'owner_opted_out',
  'authority_chain_failed',
  'manual_review',
  'inside_unenforceability_window'
);

create table property_holds (
  id           bigint generated always as identity primary key,
  property_id  text not null,
  reason       hold_reason not null,
  placed_at    timestamptz not null default now(),
  placed_by    uuid references staff (id),
  released_at  timestamptz,
  released_by  uuid references staff (id),
  release_note text,
  detail       jsonb not null default '{}'::jsonb
);

create index property_holds_active_idx on property_holds (property_id) where released_at is null;

comment on table property_holds is
  'An active hold stops all outreach, agreement generation, and claim '
  'submission for a property. A `disappeared_from_file` hold usually means the '
  'property was claimed — by the owner, or by a competing CDR under the '
  '§ 44-12-220(g) first-complete-claim rule.';

alter table property_holds enable row level security;
create policy holds_staff_read on property_holds
  for select to authenticated using (is_active_staff());
create policy holds_staff_write on property_holds
  for all to authenticated
  using (has_staff_role(array['admin', 'analyst']::staff_role[]))
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));

-- Automatic: a disappearance places a hold in the same transaction as the event.
-- Not a cron job — the gap between "we learned" and "we stopped" must be zero.
create or replace function halt_on_disappearance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'disappeared' then
    insert into property_holds (property_id, reason, detail)
    values (
      new.property_id,
      'disappeared_from_file',
      jsonb_build_object(
        'ingest_run_id', new.ingest_run_id,
        'last_value_cents', new.old_value_cents,
        'note', 'Property left the weekly DOR file. Usually means it was claimed.'
      )
    );

    insert into audit_log (actor_label, action, entity_type, entity_id, detail, statute)
    values (
      'ingest',
      'hold_placed',
      'property',
      new.property_id,
      jsonb_build_object('reason', 'disappeared_from_file'),
      'O.C.G.A. § 44-12-220(g)'
    );
  end if;
  return new;
end;
$$;

create trigger property_events_halt
  after insert on property_events
  for each row execute function halt_on_disappearance();

-- ── Enforceability ─────────────────────────────────────────────────────────
-- Mirrors lib/compliance/windows.ts. RESOLVES CONSERVATIVELY: where the
-- delivery date is unknown or year-precise, assume the LATEST possible date,
-- which pushes enforceability as far out as the data permits.
-- TODO(DOR-CONFIRM-120) — see docs/DOR-QUESTIONS.md #2.

create or replace function enforceable_on(
  p_precision delivery_date_precision,
  p_delivered date,
  p_year integer
) returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_precision = 'exact' and p_delivered is not null
      then p_delivered + 120
    when p_precision = 'year' and p_year is not null
      then make_date(p_year, 12, 31) + 120
    else null  -- unknown: caller must treat as INSIDE the window
  end;
$$;

-- ── Workable ───────────────────────────────────────────────────────────────
-- NOTE: predicates for `not under an active agreement by us` and `not
-- suppressed` are added by CREATE OR REPLACE in the migrations that introduce
-- those tables (Phases 4 and 5). Adding them here would be a forward reference.

create or replace view properties_workable
with (security_invoker = true) as
select
  p.*,
  enforceable_on(p.delivery_precision, p.delivered_to_state_at, p.year_reported) as enforceable_on,
  -- Auto-pay reaches ONLY cash, sole natural-person owners, at $500 or less.
  (
    p.cash_amount_cents is not null
    and p.cash_amount_cents <= 50000
    and p.owner_class = 'individual'
    and p.naupa_relation_code in ('SO', 'OW')
  ) as likely_auto_paid_by_dor
from properties p
where p.retired_at is null
  -- The 120-day window has run. Null enforceable_on means unknown delivery
  -- date, which we treat as inside the window.
  and enforceable_on(p.delivery_precision, p.delivered_to_state_at, p.year_reported) <= current_date
  -- Value floor, or a non-cash type whose value is materially estimable.
  and (
    p.cash_amount_cents >= 50000
    or (p.cash_amount_cents is null and (
         p.cusip is not null
         or p.share_count is not null
         or p.safe_deposit_contents is not null
       ))
  )
  and not exists (
    select 1 from property_holds h
    where h.property_id = p.property_id and h.released_at is null
  );

comment on view properties_workable is
  'Property-intrinsic workability. The $500 floor reflects § 44-12-220(d.1)(1): '
  'DOR now auto-pays sole-owner cash at or below $500 with no claim filed, so '
  'that tier self-liquidates. Agreement and suppression predicates are added by '
  'later migrations.';

-- ── Priority ───────────────────────────────────────────────────────────────
-- The categories § 44-12-220(d.1)(1) auto-pay CANNOT reach. This is Georgia's
-- real addressable market.

create or replace view properties_priority
with (security_invoker = true) as
select
  w.*,
  case
    when w.owner_class = 'multi_owner' then 'multi_owner'
    when w.owner_class = 'entity'      then 'entity_owned'
    when w.cusip is not null or w.share_count is not null then 'securities'
    when w.safe_deposit_contents is not null then 'safe_deposit'
    when w.cash_amount_cents > 50000 then 'cash_above_autopay_ceiling'
    else 'other'
  end as priority_reason
from properties_workable w
where w.owner_class in ('multi_owner', 'entity')
   or w.cusip is not null
   or w.share_count is not null
   or w.safe_deposit_contents is not null
   or w.cash_amount_cents > 50000;

comment on view properties_priority is
  'Categories DOR auto-pay cannot reach: multi-owner (auto-pay needs a SOLE '
  'owner), entity-owned (needs a NATURAL PERSON), securities and safe-deposit '
  'contents (needs CASH), and anything above the $500 ceiling. Deceased-owner '
  'and heir claims join this set once the locate phase flags them.';
