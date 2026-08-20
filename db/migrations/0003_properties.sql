-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — The DOR bulk file: properties, staging, events, ingest manifest.
--
-- Source: O.C.G.A. § 44-12-239.1(a) obligates the commissioner to provide every
-- registered CDR "a downloadable or deliverable, searchable and sortable data
-- base for all unclaimed accounts" — >1GB delimited text, refreshed WEEKLY.
--
-- EVERY FIELD IS NULLABLE. The statute qualifies each one "if provided by the
-- holder", and cash amount further "if applicable". The file is guaranteed to
-- exist; it is NOT guaranteed complete per field. DOR states explicitly that it
-- "cannot offer any assistance in using this database."
--
-- We ingest 100% of rows INCLUDING sub-$500. Workability is a computed view,
-- never a filter at ingest.
-- ═══════════════════════════════════════════════════════════════════════════

create type property_owner_class as enum ('individual', 'entity', 'multi_owner', 'unknown');
create type delivery_date_precision as enum ('exact', 'year', 'unknown');

create table properties (
  -- The DOR Property ID: first field of the bulk file, the join key, and
  -- exactly what UP-CDR2 §I requires. Natural key.
  property_id       text primary key,

  owner_name        text,
  owner_class       property_owner_class not null default 'unknown',
  -- Insured / beneficiary, for insurance property.
  insured_name      text,
  beneficiary_name  text,

  last_known_address_line1 text,
  last_known_address_line2 text,
  last_known_city   text,
  last_known_state  char(2),
  last_known_postal text,

  -- NAUPA owner-account relation code (e.g. SO sole owner, JT joint tenants).
  naupa_relation_code text,
  -- NAUPA property-type description.
  naupa_property_type text,

  -- INTEGER CENTS. Null where the holder reported no value — which triggers
  -- UP-CDR2 Path B (§ 44-12-224(c)(3)), percentages instead of dollars.
  cash_amount_cents bigint check (cash_amount_cents is null or cash_amount_cents >= 0),

  -- Unliquidated securities.
  share_count       numeric(18,6),
  issuer_name       text,
  cusip             text,

  safe_deposit_contents text,

  date_of_last_activity date,
  -- "Year property was reported to the commissioner." UNCONFIRMED whether this
  -- is the holder's report year or DOR's receipt year — which is exactly what
  -- determines the 120-day anchor. See docs/DOR-QUESTIONS.md #2.
  year_reported     integer,

  holder_name       text,
  holder_contact    text,

  -- Derived on ingest from year_reported / date_of_last_activity.
  delivery_precision delivery_date_precision not null default 'unknown',
  delivered_to_state_at date,

  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- Soft retirement only. NEVER hard-delete: a disappearance is evidence.
  retired_at        timestamptz,

  -- The exact source row, so a parser bug is recoverable without a re-delivery.
  raw               jsonb
);

comment on column properties.cash_amount_cents is
  'Exact figure from § 44-12-239.1(a)(4). The $500 workability floor lives here. '
  'NULL means the holder reported no value — NOT zero — and forces UP-CDR2 Path B.';

comment on column properties.retired_at is
  'Set when a property DISAPPEARS from the weekly file. Usually means it was '
  'claimed. Never hard-delete.';

create index properties_owner_name_idx on properties using gin (to_tsvector('simple', coalesce(owner_name, '')));
create index properties_cash_idx       on properties (cash_amount_cents desc nulls last) where retired_at is null;
create index properties_class_idx      on properties (owner_class) where retired_at is null;
create index properties_holder_idx     on properties (holder_name) where retired_at is null;

alter table properties enable row level security;

-- Staff only. There is NO anon policy and there must never be one:
-- § 44-12-239.1(b) forecloses any public "search your name" surface.
create policy properties_staff_read on properties
  for select to authenticated using (is_active_staff());

create policy properties_staff_write on properties
  for all to authenticated
  using (has_staff_role(array['admin', 'analyst']::staff_role[]))
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));

-- ── Ingest manifest ────────────────────────────────────────────────────────
-- DOR disclaims support, so the parser SNIFFS the format. Every inference is
-- recorded here, so a wrong guess is VISIBLE rather than silently corrupting
-- the table.

create type ingest_status as enum ('running', 'succeeded', 'failed', 'aborted');

create table ingest_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          ingest_status not null default 'running',

  source_filename text,
  source_bytes    bigint,
  source_sha256   text,

  -- Every sniffed inference, so a misparse is diagnosable after the fact.
  inferred_delimiter    text,
  inferred_encoding     text,
  inferred_has_header   boolean,
  inferred_line_ending  text,
  inference_confidence  jsonb not null default '{}'::jsonb,
  column_mapping        jsonb not null default '{}'::jsonb,

  rows_read       bigint not null default 0,
  rows_staged     bigint not null default 0,
  rows_rejected   bigint not null default 0,
  reject_samples  jsonb not null default '[]'::jsonb,

  events_appeared      bigint not null default 0,
  events_value_changed bigint not null default 0,
  events_disappeared   bigint not null default 0,

  error_detail    text
);

comment on table ingest_runs is
  'One row per weekly bulk-file load. The inference columns exist because DOR '
  '"cannot offer any assistance in using this database" — the format is sniffed, '
  'so every guess must be auditable.';

alter table ingest_runs enable row level security;
create policy ingest_runs_staff_read on ingest_runs
  for select to authenticated using (is_active_staff());
create policy ingest_runs_staff_write on ingest_runs
  for all to authenticated
  using (has_staff_role(array['admin', 'analyst']::staff_role[]))
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));

-- ── Staging ────────────────────────────────────────────────────────────────
-- Unlogged: this is COPY-loaded and rebuilt weekly, so WAL is wasted work.

create unlogged table properties_staging (
  ingest_run_id   uuid not null,
  property_id     text,
  owner_name      text,
  insured_name    text,
  beneficiary_name text,
  last_known_address_line1 text,
  last_known_address_line2 text,
  last_known_city text,
  last_known_state char(2),
  last_known_postal text,
  naupa_relation_code text,
  naupa_property_type text,
  cash_amount_cents bigint,
  share_count     numeric(18,6),
  issuer_name     text,
  cusip           text,
  safe_deposit_contents text,
  date_of_last_activity date,
  year_reported   integer,
  holder_name     text,
  holder_contact  text,
  raw             jsonb
);

create index properties_staging_run_idx on properties_staging (ingest_run_id, property_id);

alter table properties_staging enable row level security;
create policy staging_staff_all on properties_staging
  for all to authenticated
  using (has_staff_role(array['admin', 'analyst']::staff_role[]))
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));

-- ── Property events ────────────────────────────────────────────────────────
-- `disappeared` is THE HIGHEST-SIGNAL EVENT IN THE SYSTEM. A property leaving
-- the weekly file usually means it was claimed — by the owner, or by a
-- competing CDR. Everything in flight against it must stop immediately.

create type property_event_kind as enum ('appeared', 'value_changed', 'disappeared', 'reappeared');

create table property_events (
  id            bigint generated always as identity primary key,
  property_id   text not null,
  ingest_run_id uuid not null references ingest_runs (id),
  kind          property_event_kind not null,
  occurred_at   timestamptz not null default now(),
  old_value_cents bigint,
  new_value_cents bigint,
  detail        jsonb not null default '{}'::jsonb
);

create index property_events_property_idx on property_events (property_id, occurred_at desc);
create index property_events_kind_idx     on property_events (kind, occurred_at desc);

alter table property_events enable row level security;
create policy property_events_staff_read on property_events
  for select to authenticated using (is_active_staff());
create policy property_events_staff_write on property_events
  for insert to authenticated
  with check (has_staff_role(array['admin', 'analyst']::staff_role[]));
