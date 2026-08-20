-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Owner classification and the weekly diff.
--
-- Full refresh with diffing, run SERVER-SIDE in one transaction so the events
-- and the state they describe can never disagree. That matters most for
-- `disappeared`: it places a hold in the same transaction, so the gap between
-- "we learned the property was claimed" and "we stopped working it" is zero.
-- ═══════════════════════════════════════════════════════════════════════════

-- SB 403 auto-pay (§ 44-12-220(d.1)(1)) reaches ONLY a sole NATURAL-PERSON
-- owner holding CASH at or below $500. So entity and multi-owner property is
-- precisely what remains addressable, and this classification is what routes it.
create or replace function classify_owner(p_name text, p_relation text)
returns property_owner_class
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_name is null then 'unknown'::property_owner_class
    -- Anchored to word boundaries so "COOK" is not read as "CO".
    when p_name ~* '(^|[^a-z])(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|company|co\.|lp|l\.p\.|llp|plc|pllc|ltd|trust|foundation|partners|holdings|associates|enterprises|group)($|[^a-z])'
      then 'entity'::property_owner_class
    when p_relation in ('JT', 'TE', 'TC', 'CP')
      or p_name ~* '( & | and |,\s*jr\.?\s*&|\bor\b\s+[a-z]+\s+[a-z]+$)'
      then 'multi_owner'::property_owner_class
    else 'individual'::property_owner_class
  end;
$$;

-- The bulk file gives "year property was reported", which is year-precise at
-- best — and it is unconfirmed whether that means the holder's report year or
-- DOR's receipt year. TODO(DOR-CONFIRM-120), docs/DOR-QUESTIONS.md #2.
create or replace function derive_delivery_precision(p_year integer)
returns delivery_date_precision
language sql immutable
set search_path = public, pg_temp
as $$
  select case when p_year is null then 'unknown'::delivery_date_precision
              else 'year'::delivery_date_precision end;
$$;

-- See the deployed definition for the full body; it performs, in order:
--   1. APPEARED      insert new rows, emit events
--   2. VALUE CHANGED emit BEFORE updating, so the event carries the true old value
--   3. REAPPEARED    un-retire, but do NOT auto-release the hold — a human decides
--   4. refresh every carried-over row
--   5. DISAPPEARED   set retired_at (never hard-delete), emit the event whose
--                    trigger places the hold
create or replace function apply_ingest_diff(p_run_id uuid)
returns table (appeared bigint, value_changed bigint, disappeared bigint, reappeared bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_appeared bigint := 0; n_changed bigint := 0;
  n_gone bigint := 0;     n_back bigint := 0;
begin
  with inserted as (
    insert into properties (
      property_id, owner_name, owner_class, insured_name, beneficiary_name,
      last_known_address_line1, last_known_address_line2, last_known_city,
      last_known_state, last_known_postal, naupa_relation_code, naupa_property_type,
      cash_amount_cents, share_count, issuer_name, cusip, safe_deposit_contents,
      date_of_last_activity, year_reported, holder_name, holder_contact,
      delivery_precision, raw
    )
    select
      s.property_id, s.owner_name, classify_owner(s.owner_name, s.naupa_relation_code),
      s.insured_name, s.beneficiary_name,
      s.last_known_address_line1, s.last_known_address_line2, s.last_known_city,
      s.last_known_state, s.last_known_postal, s.naupa_relation_code, s.naupa_property_type,
      s.cash_amount_cents, s.share_count, s.issuer_name, s.cusip, s.safe_deposit_contents,
      s.date_of_last_activity, s.year_reported, s.holder_name, s.holder_contact,
      derive_delivery_precision(s.year_reported), s.raw
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
    last_seen_at = now(), raw = s.raw
  from properties_staging s
  where s.property_id = p.property_id and s.ingest_run_id = p_run_id;

  with gone as (
    update properties p set retired_at = now()
    where p.retired_at is null
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
revoke all on function classify_owner(text, text) from public, anon;
revoke all on function derive_delivery_precision(integer) from public, anon;
grant execute on function apply_ingest_diff(uuid) to authenticated;
grant execute on function classify_owner(text, text) to authenticated;
grant execute on function derive_delivery_precision(integer) to authenticated;
