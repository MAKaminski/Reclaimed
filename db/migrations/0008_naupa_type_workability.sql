-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Recognise non-cash property from its NAUPA TYPE CODE, not only from
--        the presence of a detail column.
--
-- Found while testing the queue: a property typed 'SD01 SAFE DEPOSIT BOX
-- CONTENTS' with a null cash amount AND a null contents description fell out of
-- properties_workable entirely. Every field in § 44-12-239.1(a) is qualified
-- "if provided by the holder", so a missing description is expected — and
-- safe-deposit contents is precisely a category SB 403 auto-pay CANNOT reach
-- (it requires CASH). Dropping those silently discards addressable market.
--
-- NAUPA prefixes: SD safe deposit, SC securities, IN insurance,
-- MI mineral interests, CT court deposits.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function is_material_non_cash(p_type text, p_cusip text, p_shares numeric, p_contents text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_cusip is not null
      or p_shares is not null
      or p_contents is not null
      or (p_type is not null and p_type ~* '^(SD|SC|IN|MI|CT)[0-9]');
$$;

revoke all on function is_material_non_cash(text, text, numeric, text) from public, anon;
grant execute on function is_material_non_cash(text, text, numeric, text) to authenticated;

create or replace view properties_workable
with (security_invoker = true) as
select
  p.*,
  enforceable_on(p.delivery_precision, p.delivered_to_state_at, p.year_reported) as enforceable_on,
  (
    p.cash_amount_cents is not null
    and p.cash_amount_cents <= 50000
    and p.owner_class = 'individual'
    and p.naupa_relation_code in ('SO', 'OW')
  ) as likely_auto_paid_by_dor
from properties p
where p.retired_at is null
  and enforceable_on(p.delivery_precision, p.delivered_to_state_at, p.year_reported) <= current_date
  and (
    p.cash_amount_cents >= 50000
    or (
      p.cash_amount_cents is null
      and is_material_non_cash(p.naupa_property_type, p.cusip, p.share_count, p.safe_deposit_contents)
    )
  )
  and not exists (
    select 1 from property_holds h
    where h.property_id = p.property_id and h.released_at is null
  );

create or replace view properties_priority
with (security_invoker = true) as
select
  w.*,
  case
    when w.owner_class = 'multi_owner' then 'multi_owner'
    when w.owner_class = 'entity'      then 'entity_owned'
    when w.cusip is not null or w.share_count is not null
      or (w.naupa_property_type ~* '^SC[0-9]') then 'securities'
    when w.safe_deposit_contents is not null
      or (w.naupa_property_type ~* '^SD[0-9]') then 'safe_deposit'
    when w.cash_amount_cents > 50000 then 'cash_above_autopay_ceiling'
    else 'other'
  end as priority_reason
from properties_workable w
where w.owner_class in ('multi_owner', 'entity')
   or w.cusip is not null
   or w.share_count is not null
   or w.safe_deposit_contents is not null
   or (w.naupa_property_type ~* '^(SD|SC|IN|MI|CT)[0-9]')
   or w.cash_amount_cents > 50000;
