-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — three columns California was already sending us.
--
-- Reading the real header showed 12 unmapped columns. Three of them carry
-- signal we were throwing away on every row:
--
--   NUMBER_OF_PENDING_CLAIMS  someone is ALREADY claiming this property
--   NUMBER_OF_PAID_CLAIMS     it has been paid out at least once before
--   NO_OF_OWNERS              the state's own count of owners on the record
--
-- The first is the important one, and it is a NEGATIVE signal — the opposite of
-- what a pipeline usually optimises for. A property with a claim in flight is
-- the worst target on the list: the owner is already engaged, quite possibly by
-- a competing CDR who already holds a signed agreement, and § 44-12-224(b) voids
-- a representative's claim on a defective agreement. Soliciting into that is
-- wasted postage at best and interference at worst. So it is excluded from
-- properties_workable rather than merely scored down.
--
-- COALESCE(pending_claims_count, 0) = 0 — NULL must NOT exclude. NULL means the
-- publisher never told us (Georgia's file has no such column), and treating
-- "unknown" as "contested" would empty the Georgia queue the day this ships.
--
-- NO_OF_OWNERS is kept ALONGSIDE the owner_count derived from row multiplicity
-- in 0024, not instead of it. They were cross-checked over the 3,433 loaded rows
-- and agree on 3,432. The single disagreement — property 10807126, which declares
-- two owners and ships one row with no sibling in any of the four files — is a
-- defect in California's file, and keeping both columns is what makes that
-- visible instead of silently picking a winner.
--
-- apply_ingest_diff below is the deployed body with THREE edits and nothing
-- else: the three columns added to the insert list, to the insert select, and to
-- the update SET. It was derived by editing the output of pg_get_functiondef
-- programmatically and diffing, because hand-transcribing this function from a
-- summary is exactly how its `s.property_id is not null` guard got dropped once
-- before. staged_dedup selects s.*, so the new staging columns flow through with
-- no change to the dedup CTE.
-- ─────────────────────────────────────────────────────────────────────────────

alter table properties
  add column if not exists pending_claims_count  integer,
  add column if not exists paid_claims_count     integer,
  add column if not exists declared_owner_count  integer;

alter table properties_staging
  add column if not exists pending_claims_count  integer,
  add column if not exists paid_claims_count     integer,
  add column if not exists declared_owner_count  integer;

comment on column properties.pending_claims_count is
  'Claims already in flight at the state. > 0 excludes the row from properties_workable: someone is already claiming it.';
comment on column properties.declared_owner_count is
  'The state''s own owner count, kept beside the owner_count derived from row multiplicity so a disagreement stays visible.';

-- Partial index: the queue path filters on this constantly and the selective
-- side is the small one. Contested properties are the minority.
create index if not exists properties_pending_claims_idx
  on properties (pending_claims_count)
  where pending_claims_count > 0;

CREATE OR REPLACE FUNCTION public.apply_ingest_diff(p_run_id uuid)
 RETURNS TABLE(appeared bigint, value_changed bigint, disappeared bigint, reappeared bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n_appeared bigint := 0; n_changed bigint := 0;
  n_gone bigint := 0;     n_back bigint := 0;
  v_source_key text;
begin
  select source_key into v_source_key from ingest_runs where id = p_run_id;

  create temporary table staged_dedup on commit drop as
  select distinct on (s.property_id) s.*, cnt.owner_count, cnt.co_owner_names
  from properties_staging s
  join (
    select property_id, count(*)::int as owner_count,
           (array_agg(owner_name order by owner_name))[2:] as co_owner_names
    from properties_staging where ingest_run_id = p_run_id group by property_id
  ) cnt on cnt.property_id = s.property_id
  where s.ingest_run_id = p_run_id
  order by s.property_id, s.owner_name;

  create index on staged_dedup (property_id);
  analyze staged_dedup;

  with inserted as (
    insert into properties (
      property_id, owner_name, owner_class, insured_name, beneficiary_name,
      last_known_address_line1, last_known_address_line2, last_known_city,
      last_known_state, last_known_postal, naupa_relation_code, naupa_property_type,
      cash_amount_cents, share_count, issuer_name, cusip, safe_deposit_contents,
      date_of_last_activity, year_reported, holder_name, holder_contact,
      delivery_precision, raw, source_key, owner_count, co_owner_names,
      pending_claims_count, paid_claims_count, declared_owner_count
    )
    select
      s.property_id, s.owner_name,
      classify_owner_with_count(s.owner_name, s.naupa_relation_code, s.owner_count),
      s.insured_name, s.beneficiary_name,
      s.last_known_address_line1, s.last_known_address_line2, s.last_known_city,
      s.last_known_state, s.last_known_postal, s.naupa_relation_code, s.naupa_property_type,
      s.cash_amount_cents, s.share_count, s.issuer_name, s.cusip, s.safe_deposit_contents,
      s.date_of_last_activity, s.year_reported, s.holder_name, s.holder_contact,
      derive_delivery_precision(s.year_reported), s.raw,
      coalesce(s.source_key, v_source_key), s.owner_count, s.co_owner_names,
      s.pending_claims_count, s.paid_claims_count, s.declared_owner_count
    from staged_dedup s
    where s.property_id is not null
      and not exists (select 1 from properties p where p.property_id = s.property_id)
    returning property_id, cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, new_value_cents)
    select property_id, p_run_id, 'appeared', cash_amount_cents from inserted returning 1
  ) select count(*) into n_appeared from evented;

  with changed as (
    select p.property_id, p.cash_amount_cents as old_cents, s.cash_amount_cents as new_cents
    from properties p join staged_dedup s on s.property_id = p.property_id
    where p.cash_amount_cents is distinct from s.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, old_value_cents, new_value_cents)
    select property_id, p_run_id, 'value_changed', old_cents, new_cents from changed returning 1
  ) select count(*) into n_changed from evented;

  with back as (
    update properties p set retired_at = null, last_seen_at = now()
    from staged_dedup s
    where s.property_id = p.property_id and p.retired_at is not null
    returning p.property_id, p.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, new_value_cents)
    select property_id, p_run_id, 'reappeared', cash_amount_cents from back returning 1
  ) select count(*) into n_back from evented;

  update properties p set
    owner_name = s.owner_name,
    owner_class = classify_owner_with_count(s.owner_name, s.naupa_relation_code, s.owner_count),
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
    source_key = coalesce(s.source_key, v_source_key, p.source_key),
    owner_count = s.owner_count, co_owner_names = s.co_owner_names,
    pending_claims_count = s.pending_claims_count,
    paid_claims_count = s.paid_claims_count,
    declared_owner_count = s.declared_owner_count
  from staged_dedup s where s.property_id = p.property_id;

  with gone as (
    update properties p set retired_at = now()
    where p.retired_at is null
      and (v_source_key is null or p.source_key is not distinct from v_source_key)
      and not exists (select 1 from staged_dedup s where s.property_id = p.property_id)
    returning p.property_id, p.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, old_value_cents)
    select property_id, p_run_id, 'disappeared', cash_amount_cents from gone returning 1
  ) select count(*) into n_gone from evented;

  update ingest_runs set
    events_appeared = n_appeared, events_value_changed = n_changed,
    events_disappeared = n_gone, status = 'succeeded', finished_at = now()
  where id = p_run_id;

  delete from properties_staging where ingest_run_id = p_run_id;
  return query select n_appeared, n_changed, n_gone, n_back;
end; $function$

-- properties_workable, unchanged except for the single COALESCE predicate above.
-- security_invoker is restated explicitly: CREATE OR REPLACE VIEW carries
-- reloptions forward, but this view is the RLS boundary for every staff surface
-- and it should not depend on that behaviour being remembered.
create or replace view properties_workable as
SELECT property_id,
    owner_name,
    owner_class,
    insured_name,
    beneficiary_name,
    last_known_address_line1,
    last_known_address_line2,
    last_known_city,
    last_known_state,
    last_known_postal,
    naupa_relation_code,
    naupa_property_type,
    cash_amount_cents,
    share_count,
    issuer_name,
    cusip,
    safe_deposit_contents,
    date_of_last_activity,
    year_reported,
    holder_name,
    holder_contact,
    delivery_precision,
    delivered_to_state_at,
    first_seen_at,
    last_seen_at,
    retired_at,
    raw,
    enforceable_on(delivery_precision, delivered_to_state_at, year_reported) AS enforceable_on,
    cash_amount_cents IS NOT NULL AND cash_amount_cents <= 50000 AND owner_class = 'individual'::property_owner_class AND (naupa_relation_code = ANY (ARRAY['SO'::text, 'OW'::text])) AS likely_auto_paid_by_dor
   FROM properties p
  WHERE retired_at IS NULL AND COALESCE(pending_claims_count, 0) = 0 AND enforceable_on(delivery_precision, delivered_to_state_at, year_reported) <= CURRENT_DATE AND (cash_amount_cents >= 50000 OR cash_amount_cents IS NULL AND is_material_non_cash(naupa_property_type, cusip, share_count, safe_deposit_contents)) AND NOT (EXISTS ( SELECT 1
           FROM property_holds h
          WHERE h.property_id = p.property_id AND h.released_at IS NULL)) AND NOT (EXISTS ( SELECT 1
           FROM agreements a
          WHERE (p.property_id = ANY (a.property_ids)) AND (a.status = ANY (ARRAY['draft'::agreement_status, 'sent_for_signature'::agreement_status, 'signed'::agreement_status, 'submitted'::agreement_status])))) AND NOT (EXISTS ( SELECT 1
           FROM suppressions s
          WHERE s.identifier_kind = 'property_id'::text AND s.identifier = p.property_id OR s.identifier_kind = 'owner_name'::text AND p.owner_name IS NOT NULL AND s.identifier = lower(regexp_replace(p.owner_name, '\s+'::text, ' '::text, 'g'::text))));

alter view properties_workable set (security_invoker = true);

notify pgrst, 'reload schema';
