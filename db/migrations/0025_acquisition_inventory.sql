-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — acquisition inventory.
--
-- 3,433 real California rows landed in `properties` and NOTHING in the product
-- showed them. Every staff surface reads from `work_queue`, which descends from
-- `properties_workable`, which requires
--
--     enforceable_on(delivery_precision, delivered_to_state_at, year_reported)
--       <= current_date
--
-- California's file carries neither a delivery date nor a year reported, so
-- enforceable_on() returns NULL, `NULL <= current_date` is NULL, and the rows
-- are filtered out. The board read "0 unworked" while a third of a gigabyte of
-- real data sat one table away.
--
-- The bug was never the filter. It was that we had no surface which reports
-- LOADED as distinct from WORKABLE, so "we hold this data" and "we may act on
-- this data" were indistinguishable from the outside — and the only reading
-- available was the alarming one.
--
-- This view reports holdings. It deliberately does NOT feed the queue, and it
-- must not: California is `researched_not_verified_for_build` in `state_rules`,
-- and Georgia's 120-day § 44-12-220(d.1)(4) window is not California law. Making
-- these rows workable requires verifying California's own rules, not relaxing a
-- date predicate.
--
-- `workable_blocked_by` is mechanical, derived from the counts in the same row.
-- It is a diagnosis of the FILTER, never a licence to bypass it.
-- ─────────────────────────────────────────────────────────────────────────────

create view acquisition_inventory as
with live as (
  select
    coalesce(source_key, '(unattributed)')                              as source_key,
    count(*) filter (where retired_at is null)                          as live_rows,
    count(*) filter (where retired_at is not null)                      as retired_rows,
    count(*) filter (where retired_at is null and owner_count > 1)      as multi_owner_rows,
    count(*) filter (where retired_at is null
                       and owner_class = 'entity')                      as entity_rows,
    count(*) filter (where retired_at is null
                       and cash_amount_cents is not null)               as valued_rows,
    count(*) filter (where retired_at is null
                       and cash_amount_cents >= 50000)                  as above_autopay_rows,
    sum(cash_amount_cents) filter (where retired_at is null)            as total_cash_cents,
    max(cash_amount_cents) filter (where retired_at is null)            as max_cash_cents,
    count(*) filter (
      where retired_at is null
        and enforceable_on(delivery_precision, delivered_to_state_at, year_reported)
              is not null)                                             as dated_rows,
    count(*) filter (
      where retired_at is null
        and enforceable_on(delivery_precision, delivered_to_state_at, year_reported)
              <= current_date)                                         as past_window_rows,
    min(first_seen_at)                                                  as first_loaded_at,
    max(last_seen_at)                                                   as last_seen_at
  from properties
  group by 1
),
workable as (
  select coalesce(p.source_key, '(unattributed)') as source_key,
         count(*)                                 as workable_rows
  from properties_workable w
  join properties p on p.property_id = w.property_id
  group by 1
)
select
  l.source_key,
  l.live_rows,
  l.retired_rows,
  l.multi_owner_rows,
  l.entity_rows,
  l.valued_rows,
  l.above_autopay_rows,
  l.total_cash_cents,
  l.max_cash_cents,
  l.dated_rows,
  l.past_window_rows,
  l.first_loaded_at,
  l.last_seen_at,
  coalesce(w.workable_rows, 0) as workable_rows,
  case
    when l.live_rows = 0                        then null
    when coalesce(w.workable_rows, 0) > 0       then null
    when l.dated_rows = 0                       then 'no_delivery_date'
    when l.past_window_rows = 0                 then 'inside_dor_window'
    when l.above_autopay_rows = 0               then 'below_autopay_ceiling'
    else                                             'other_filter'
  end as workable_blocked_by
from live l
left join workable w on w.source_key = l.source_key;

comment on view acquisition_inventory is
  'Holdings per source: what we have LOADED, which is not what we may WORK. '
  'Reports the workable count alongside, and names the predicate that blocks it. '
  'Never a queue — see 0025 header.';

grant select on acquisition_inventory to authenticated;

notify pgrst, 'reload schema';
