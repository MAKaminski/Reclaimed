-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — Claims, submissions, and expected receipts.
--
-- THERE IS NO CDR E-FILING PORTAL. Claims are EMAILED as PDFs to
-- ucp.cdr.claims@dor.ga.gov, so submission is an outbound email with an
-- idempotency key and a stored copy of the EXACT BYTES SENT.
--
-- Clocks are set by TRIGGER, not by a generated column: `timestamptz + interval`
-- is not immutable (it depends on the TimeZone setting), so Postgres rejects it
-- in a generated expression.
-- ═══════════════════════════════════════════════════════════════════════════

create type claim_status as enum (
  'draft', 'submitted', 'additional_info_requested', 'approved', 'denied',
  'paid', 'withdrawn', 'void'
);

create table claims (
  id              uuid primary key default gen_random_uuid(),
  agreement_id    uuid not null references agreements (id),
  property_ids    text[] not null check (cardinality(property_ids) > 0),
  status          claim_status not null default 'draft',

  claimed_amount_cents bigint,
  fee_pct         numeric(5,2) not null,
  fee_cents       bigint not null,
  net_to_claimant_cents bigint,

  submitted_at    timestamptz,
  decision_due_at timestamptz,
  decided_at      timestamptz,
  decision_note   text,
  payment_due_at  timestamptz,
  appeal_deadline_at timestamptz,

  created_by      uuid not null references staff (id),
  created_at      timestamptz not null default now()
);

comment on column claims.fee_pct is
  'Per-claim STRATEGIC variable, not a constant. Under 44-12-220(g) rank 5, a CDR competing with another CDR on the same property loses to the LOWER FEE. Pinning this at 30 is a decision to lose those.';

create index claims_status_idx on claims (status, submitted_at desc);
create index claims_decision_due_idx on claims (decision_due_at) where status = 'submitted';

alter table claims enable row level security;
create policy claims_staff_read on claims
  for select to authenticated using (is_active_staff());
create policy claims_staff_write on claims
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));
create rule claims_no_delete as on delete to claims do instead nothing;

create or replace function set_claim_clocks()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- 90-day decision window from submission. § 44-12-220(b).
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is distinct from new.submitted_at) then
    new.decision_due_at := new.submitted_at + interval '90 days';
  end if;

  if tg_op = 'UPDATE' then
    -- 60-day payment window from approval, to BOTH parties. § 44-12-220(d)(3).
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.decided_at := coalesce(new.decided_at, now());
      new.payment_due_at := new.decided_at + interval '60 days';
    end if;
    -- 90 days to appeal to Superior Court of Fulton County. § 44-12-221.
    if new.status = 'denied' and old.status is distinct from 'denied' then
      new.decided_at := coalesce(new.decided_at, now());
      new.appeal_deadline_at := new.decided_at + interval '90 days';
    end if;
  end if;
  return new;
end;
$$;

create trigger claims_clocks before insert or update on claims
  for each row execute function set_claim_clocks();
revoke all on function set_claim_clocks() from public, anon, authenticated;

create table claim_submissions (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references claims (id),
  idempotency_key text not null unique,
  recipient_email text not null,
  subject         text not null,
  body            text not null,
  payload_sha256  text not null,
  payload_storage_path text,
  attachment_count integer not null check (attachment_count > 0),
  sent_at         timestamptz not null default now(),
  sent_by         uuid references staff (id),
  provider_message_id text,
  constraint claims_go_to_dor check (recipient_email = 'ucp.cdr.claims@dor.ga.gov')
);

comment on constraint claims_go_to_dor on claim_submissions is
  'Claims are emailed to the Unclaimed Property Section, and nowhere else. A misaddressed claim is not filed.';

alter table claim_submissions enable row level security;
create policy submissions_staff_read on claim_submissions
  for select to authenticated using (is_active_staff());
create policy submissions_staff_write on claim_submissions
  for insert to authenticated with check (is_active_staff());
create rule submissions_no_update as on update to claim_submissions do instead nothing;
create rule submissions_no_delete as on delete to claim_submissions do instead nothing;

-- § 44-12-220(c)(2) (SB 403) offsets payment against unpaid Georgia tax
-- liability FIRST, so receiving less than approved is not a discrepancy.
-- There is NO payments integration in this repo, by design (§1.1).
create table expected_receipts (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references claims (id),
  expected_cents  bigint not null,
  expected_by     date,
  received_cents  bigint,
  received_at     date,
  tax_offset_cents bigint,
  reconciled_at   timestamptz,
  reconciled_by   uuid references staff (id),
  note            text
);

alter table expected_receipts enable row level security;
create policy receipts_staff_read on expected_receipts
  for select to authenticated using (is_active_staff());
create policy receipts_staff_write on expected_receipts
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));

create or replace view claim_clocks
with (security_invoker = true) as
select
  c.id, c.status, c.property_ids, c.fee_pct,
  c.submitted_at, c.decision_due_at,
  case when c.status = 'submitted' then (c.decision_due_at::date - current_date) end as days_to_decision,
  c.decided_at, c.payment_due_at,
  case when c.status = 'approved' then (c.payment_due_at::date - current_date) end as days_to_payment,
  c.appeal_deadline_at,
  case when c.status = 'denied' then (c.appeal_deadline_at::date - current_date) end as days_to_appeal,
  (c.status = 'submitted' and c.decision_due_at < now()) as decision_overdue,
  (c.status = 'approved' and c.payment_due_at < now()) as payment_overdue
from claims c
where c.status not in ('void', 'withdrawn');
