-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — multi-owner property.
--
-- California's export is ONE ROW PER OWNER. 14.5% of property_ids repeat:
-- 10001694 is both REED BRADFORD and REED MARJORIE A, same $1,330.74 balance,
-- NO_OF_OWNERS = 2. Loading that against a property_id primary key fails with
-- "duplicate key value violates unique constraint properties_pkey" — which is
-- how this was found, mid-COPY on a live load.
--
-- The tempting fix is `distinct on (property_id)`. It would unblock the load and
-- silently discard every co-owner, which is exactly the wrong trade: joint and
-- multi-owner property is the category SB 403's <=$500 auto-pay CANNOT reach,
-- and therefore the category actually worth working.
--
-- So the row is collapsed rather than truncated. Georgia's file may well be one
-- row per property; this costs nothing there (owner_count = 1, co_owner_names
-- empty) and is correct here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table properties         add column owner_count integer;
alter table properties         add column co_owner_names text[];
-- Deliberately NOT on properties_staging: these are DERIVED in the diff by
-- grouping the staged rows, never loaded from the file. Adding them to staging
-- would put them in `s.*` and collide with the computed columns below.

comment on column properties.owner_count is
  'How many owners the source reported. >1 means the claim needs every one of '
  'them, which is what makes it survive SB 403 auto-pay.';
comment on column properties.co_owner_names is
  'Owners beyond the one in owner_name. Preserved rather than dropped: a joint '
  'claim requires all of them.';

create index properties_multi_owner_idx on properties (owner_count)
  where owner_count > 1;

-- owner_count is AUTHORITATIVE where the source provides it. classify_owner()
-- infers multi-owner from name patterns and the NAUPA relation code; California
-- supplies neither, so 506 genuinely joint properties landed as 'individual' —
-- and owner_class is what properties_priority uses to decide what SB 403
-- auto-pay cannot reach. An entity name still wins: a building with nine
-- claimants is an entity matter, not a joint account.
create or replace function classify_owner_with_count(
  p_name text, p_relation text, p_owner_count integer
) returns property_owner_class
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when classify_owner(p_name, p_relation) = 'entity' then 'entity'::property_owner_class
    when coalesce(p_owner_count, 1) > 1 then 'multi_owner'::property_owner_class
    else classify_owner(p_name, p_relation)
  end;
$$;

revoke all on function classify_owner_with_count(text, text, integer) from public, anon;
grant execute on function classify_owner_with_count(text, text, integer) to authenticated;

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

  -- California lists ONE ROW PER OWNER: 14.5% of property_ids repeat, e.g.
  -- 10001694 appears as REED BRADFORD and REED MARJORIE A, same $1,330.74,
  -- NO_OF_OWNERS = 2. Loading that against a property_id primary key raised
  -- "duplicate key value violates unique constraint properties_pkey".
  --
  -- `distinct on` would have unblocked it and silently dropped every co-owner,
  -- which is exactly backwards: multi-owner property is the priority tier
  -- SB 403 auto-pay cannot reach. So collapse instead — first owner
  -- alphabetically on the row, the rest kept in co_owner_names, real count in
  -- owner_count.
  create temporary table staged_dedup on commit drop as
  select distinct on (s.property_id) s.*, cnt.owner_count, cnt.co_owner_names
  from properties_staging s
  join (
    select property_id,
           count(*)::int as owner_count,
           (array_agg(owner_name order by owner_name))[2:] as co_owner_names
    from properties_staging
    where ingest_run_id = p_run_id
    group by property_id
  ) cnt on cnt.property_id = s.property_id
  where s.ingest_run_id = p_run_id
  order by s.property_id, s.owner_name;

  -- The temp table needs its own index. properties_staging carries
  -- (ingest_run_id, property_id), and dropping the diff onto an UNINDEXED temp
  -- table turned the disappearance anti-join into a sequential scan per row —
  -- 25k x 25k, which hit the 2-minute statement timeout mid-diff.
  create index on staged_dedup (property_id);
  analyze staged_dedup;

  with inserted as (
    insert into properties (
      property_id, owner_name, owner_class, insured_name, beneficiary_name,
      last_known_address_line1, last_known_address_line2, last_known_city,
      last_known_state, last_known_postal, naupa_relation_code, naupa_property_type,
      cash_amount_cents, share_count, issuer_name, cusip, safe_deposit_contents,
      date_of_last_activity, year_reported, holder_name, holder_contact,
      delivery_precision, raw, source_key, owner_count, co_owner_names
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
      coalesce(s.source_key, v_source_key), s.owner_count, s.co_owner_names
    from staged_dedup s
    where s.property_id is not null
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
    join staged_dedup s on s.property_id = p.property_id
    where p.cash_amount_cents is distinct from s.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, old_value_cents, new_value_cents)
    select property_id, p_run_id, 'value_changed', old_cents, new_cents from changed
    returning 1
  ) select count(*) into n_changed from evented;

  with back as (
    update properties p set retired_at = null, last_seen_at = now()
    from staged_dedup s
    where s.property_id = p.property_id and p.retired_at is not null
    returning p.property_id, p.cash_amount_cents
  ), evented as (
    insert into property_events (property_id, ingest_run_id, kind, new_value_cents)
    select property_id, p_run_id, 'reappeared', cash_amount_cents from back
    returning 1
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
    owner_count = s.owner_count, co_owner_names = s.co_owner_names
  from staged_dedup s
  where s.property_id = p.property_id;

  -- Disappearance is scoped to the SOURCE. Without this, loading California
  -- would retire every Georgia row for being absent from a California file --
  -- and each retirement fires halt_on_disappearance(), placing a hold that a
  -- human must clear by hand.
  with gone as (
    update properties p set retired_at = now()
    where p.retired_at is null
      and (v_source_key is null or p.source_key is not distinct from v_source_key)
      and not exists (select 1 from staged_dedup s
                      where s.property_id = p.property_id)
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
