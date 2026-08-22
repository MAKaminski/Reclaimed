-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — data acquisition provenance.
--
-- Retrieval and load have different cardinality in BOTH directions, which is why
-- `acquisitions` is a table rather than more columns on ingest_runs:
--
--   * A check that finds an unchanged ETag produces no ingest run at all — and
--     "we checked on 22 Aug and nothing had changed" is exactly the record you
--     want when someone asks whether you stayed current.
--   * An ingest can happen with no acquisition, because Georgia's file is
--     delivered to a human out of band (§ 44-12-239.1(a)).
--
-- source_key on `properties` is a compliance fact, not bookkeeping:
-- § 44-12-239.1(b) restricts what the Georgia CDR file may be used for, so which
-- file a row came from governs what may lawfully be done with it.
--
-- apply_ingest_diff below is the 0006 body with THREE changes and nothing else:
-- carry source_key on insert, carry it on refresh, and scope the disappearance
-- anti-join to the source being loaded.
-- ─────────────────────────────────────────────────────────────────────────────

create type acquisition_mode as enum ('open', 'restricted', 'entitled');

create type acquisition_outcome as enum (
  'retrieved',    -- a new artifact was downloaded
  'unchanged',    -- checked; the publisher had nothing new
  'refused',      -- a machine may not fetch this source
  'failed'
);

create table acquisitions (
  id            bigserial primary key,
  source_key    text not null,
  state_code    text not null,
  mode          acquisition_mode not null,
  outcome       acquisition_outcome not null,
  checked_at    timestamptz not null default now(),
  -- Null unless outcome = 'retrieved'.
  artifact_url  text,
  etag          text,
  last_modified timestamptz,
  bytes         bigint check (bytes is null or bytes >= 0),
  sha256        text,
  file_count    integer check (file_count is null or file_count > 0),
  -- The refusal or the error. Always populated for 'refused' and 'failed'.
  detail        text,
  constraint acquisitions_retrieved_has_artifact check (
    outcome <> 'retrieved' or (artifact_url is not null and sha256 is not null)
  ),
  constraint acquisitions_refused_has_reason check (
    outcome not in ('refused', 'failed') or length(trim(coalesce(detail, ''))) >= 20
  )
);

create index acquisitions_source_idx on acquisitions (source_key, checked_at desc);
create index acquisitions_retrieved_idx on acquisitions (source_key, checked_at desc)
  where outcome = 'retrieved';

comment on table acquisitions is
  'Every attempt to obtain source data, including checks that found nothing new '
  'and refusals. The refusal rows are the audit trail showing we did not '
  'circumvent an access control - ADR-0001 section 3.';

alter table acquisitions enable row level security;

create policy acquisitions_staff_read on acquisitions
  for select using (is_active_staff());

-- Which source each row came from, and which run last touched it.
alter table properties add column source_key text;
alter table properties_staging add column source_key text;
alter table ingest_runs add column source_key text;
alter table ingest_runs add column acquisition_id bigint references acquisitions (id);
-- CA ships four CSVs in one archive; DOR-QUESTIONS #5 lists "one file or
-- several" as unknown for Georgia. One run, N files.
alter table ingest_runs add column source_file_count integer;
alter table ingest_runs add column file_inferences jsonb;

create index properties_source_idx on properties (source_key)
  where source_key is not null;

comment on column properties.source_key is
  'Which registered data source this row came from. A compliance fact: '
  'O.C.G.A. 44-12-239.1(b) restricts use of the Georgia CDR file specifically, '
  'so provenance governs what may lawfully be done with the row.';

create or replace function apply_ingest_diff(p_run_id uuid)
returns table (appeared bigint, value_changed bigint, disappeared bigint, reappeared bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_appeared bigint := 0; n_changed bigint := 0;
  n_gone bigint := 0;     n_back bigint := 0;
  v_source_key text;
begin
  select source_key into v_source_key from ingest_runs where id = p_run_id;

  with inserted as (
    insert into properties (
      property_id, owner_name, owner_class, insured_name, beneficiary_name,
      last_known_address_line1, last_known_address_line2, last_known_city,
      last_known_state, last_known_postal, naupa_relation_code, naupa_property_type,
      cash_amount_cents, share_count, issuer_name, cusip, safe_deposit_contents,
      date_of_last_activity, year_reported, holder_name, holder_contact,
      delivery_precision, raw, source_key
    )
    select
      s.property_id, s.owner_name, classify_owner(s.owner_name, s.naupa_relation_code),
      s.insured_name, s.beneficiary_name,
      s.last_known_address_line1, s.last_known_address_line2, s.last_known_city,
      s.last_known_state, s.last_known_postal, s.naupa_relation_code, s.naupa_property_type,
      s.cash_amount_cents, s.share_count, s.issuer_name, s.cusip, s.safe_deposit_contents,
      s.date_of_last_activity, s.year_reported, s.holder_name, s.holder_contact,
      derive_delivery_precision(s.year_reported), s.raw,
      coalesce(s.source_key, v_source_key)
    from properties_staging s
    where s.ingest_run_id = p_run_id
      and s.property_id is not null
      and not exists (select 1 from properties p where p.property_id = s.property_id)
    returning property_id, cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, new_value_cents)
    select property_id, p_run_id, 'appeared', cash_amount_cents from inserted
    returning 1
  ) select count(*) into n_appeared from evented;

  with changed as (
    select p.property_id, p.cash_amount_cents as old_cents, s.cash_amount_cents as new_cents
    from properties p
    join properties_staging s on s.property_id = p.property_id and s.ingest_run_id = p_run_id
    where p.cash_amount_cents is distinct from s.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, old_value_cents, new_value_cents)
    select property_id, p_run_id, 'value_changed', old_cents, new_cents from changed
    returning 1
  ) select count(*) into n_changed from evented;

  with back as (
    update properties p set retired_at = null, last_seen_at = now()
    from properties_staging s
    where s.property_id = p.property_id and s.ingest_run_id = p_run_id and p.retired_at is not null
    returning p.property_id, p.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, new_value_cents)
    select property_id, p_run_id, 'reappeared', cash_amount_cents from back
    returning 1
  ) select count(*) into n_back from evented;

  update properties p set
    owner_name = s.owner_name,
    owner_class = classify_owner(s.owner_name, s.naupa_relation_code),
    insured_name = s.insured_name, beneficiary_name = s.beneficiary_name,
    last_known_address_line1 = s.last_known_address_line1,
    last_known_address_line2 = s.last_known_address_line2,
    last_known_city = s.last_known_city, last_known_state = s.last_known_state,
    last_known_postal = s.last_known_postal,
    naupa_relation_code = s.naupa_relation_code, naupa_property_type = s.naupa_property_type,
    cash_amount_cents = s.cash_amount_cents, share_count = s.share_count,
    issuer_name = s.issuer_name, cusip = s.cusip,
    safe_deposit_contents = s.safe_deposit_contents,
    date_of_last_activity = s.date_of_last_activity, year_reported = s.year_reported,
    holder_name = s.holder_name, holder_contact = s.holder_contact,
    delivery_precision = derive_delivery_precision(s.year_reported),
    last_seen_at = now(), raw = s.raw,
    source_key = coalesce(s.source_key, v_source_key, p.source_key)
  from properties_staging s
  where s.property_id = p.property_id and s.ingest_run_id = p_run_id;

  -- Disappearance is scoped to the SOURCE. Without this, loading California
  -- would retire every Georgia row for being absent from a California file --
  -- and each retirement fires halt_on_disappearance(), placing a hold that a
  -- human must clear by hand.
  with gone as (
    update properties p set retired_at = now()
    where p.retired_at is null
      and (v_source_key is null or p.source_key is not distinct from v_source_key)
      and not exists (select 1 from properties_staging s
                      where s.property_id = p.property_id and s.ingest_run_id = p_run_id)
    returning p.property_id, p.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, old_value_cents)
    select property_id, p_run_id, 'disappeared', cash_amount_cents from gone
    returning 1
  ) select count(*) into n_gone from evented;

  update ingest_runs set
    events_appeared = n_appeared, events_value_changed = n_changed,
    events_disappeared = n_gone, status = 'succeeded', finished_at = now()
  where id = p_run_id;

  delete from properties_staging where ingest_run_id = p_run_id;
  return query select n_appeared, n_changed, n_gone, n_back;
end;
$$;

revoke all on function apply_ingest_diff(uuid) from public, anon;
grant execute on function apply_ingest_diff(uuid) to authenticated;

notify pgrst, 'reload schema';
