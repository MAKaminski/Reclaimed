-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Foundation: conventions, staff identity, audit log.
--
-- Conventions enforced throughout this schema:
--   · All money is BIGINT INTEGER CENTS. No numeric, no float, ever. A rounding
--     error on the wrong side of the § 44-12-224(d)(1) 30% ceiling is an
--     over-cap agreement.
--   · All timestamps are timestamptz.
--   · RLS is DENY-ALL by default. § 44-12-239.1(b) prohibits distributing the
--     CDR data file except to solicit owners; there is no public read surface.
--   · Nothing is hard-deleted. History is evidence.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── Staff identity ─────────────────────────────────────────────────────────
-- Every RLS policy in this schema resolves through here. A user with no row is
-- not staff and sees nothing.

create type staff_role as enum ('admin', 'analyst', 'reviewer', 'readonly');

create table staff (
  id            uuid primary key references auth.users (id) on delete restrict,
  email         citext not null unique,
  full_name     text   not null,
  role          staff_role not null default 'readonly',
  -- § 44-12-239(d): background-screened under the 20-year dishonesty bar, and
  -- named to DOR. Only screened staff may touch a claim.
  dor_designated_agent boolean not null default false,
  background_check_cleared_at timestamptz,
  deactivated_at timestamptz,
  created_at    timestamptz not null default now()
);

comment on column staff.dor_designated_agent is
  'True only for agents designated to DOR under § 44-12-239 and cleared against '
  'the 20-year dishonesty/deceit/fraud and fiduciary-breach bar of § 44-12-239(d). '
  'Required to submit or process claims.';

create or replace function is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff
    where staff.id = auth.uid()
      and staff.deactivated_at is null
  );
$$;

create or replace function has_staff_role(required staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff
    where staff.id = auth.uid()
      and staff.deactivated_at is null
      and staff.role = any(required)
  );
$$;

alter table staff enable row level security;

create policy staff_self_read on staff
  for select to authenticated
  using (id = auth.uid() or has_staff_role(array['admin']::staff_role[]));

create policy staff_admin_write on staff
  for all to authenticated
  using (has_staff_role(array['admin']::staff_role[]))
  with check (has_staff_role(array['admin']::staff_role[]));

-- ── Audit log ──────────────────────────────────────────────────────────────
-- Append-only. If a regulator asks how we established authority on a given
-- claim, or who changed what and when, the answer must be one query.

create table audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references staff (id),
  -- Null actor means a system process (ingest, scheduled job).
  actor_label text,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  -- What changed, and the compliance-relevant context around it.
  detail      jsonb not null default '{}'::jsonb,
  statute     text
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_action_idx  on audit_log (action, occurred_at desc);

alter table audit_log enable row level security;

create policy audit_log_staff_read on audit_log
  for select to authenticated
  using (is_active_staff());

-- Append-only: no update, no delete policy exists, for anyone.
create policy audit_log_staff_insert on audit_log
  for insert to authenticated
  with check (is_active_staff());

create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;

-- ── Data egress log ────────────────────────────────────────────────────────
-- § 44-12-239.1(b): the CDR file may not be distributed "except for the purpose
-- of soliciting owners of unclaimed property to offer claim services."
-- Violations are referred to the Attorney General. Every export is recorded
-- with a STATED PURPOSE so the record exists before the question is asked.

create table data_egress_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid not null references staff (id),
  export_kind text not null,
  row_count   integer not null check (row_count >= 0),
  stated_purpose text not null,
  destination text,
  constraint egress_purpose_substantive check (length(trim(stated_purpose)) >= 20)
);

comment on table data_egress_log is
  'Every export of CDR-file-derived data. § 44-12-239.1(b) permits distribution '
  'ONLY to solicit owners to offer claim services — no resale, no B2B lookup, '
  'no enrichment-as-a-service, no public search tool, no partner sharing.';

alter table data_egress_log enable row level security;

create policy egress_staff_read on data_egress_log
  for select to authenticated using (is_active_staff());

create policy egress_staff_insert on data_egress_log
  for insert to authenticated with check (is_active_staff() and actor_id = auth.uid());

create rule egress_no_update as on update to data_egress_log do instead nothing;
create rule egress_no_delete as on delete to data_egress_log do instead nothing;
