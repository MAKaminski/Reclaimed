-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Recognise non-cash property from its NAUPA TYPE CODE, not only from
--        the presence of a detail column.
--
-- Found while testing the queue: a property typed 'SD01 SAFE DEPOSIT BOX
-- CONTENTS' with a null cash amount AND a null contents description fell out of
-- properties_workable entirely. Every field in § 44-12-239.1(a) is qualified
-- "if provided by the holder", so a missing contents description is expected —
-- and safe-deposit contents is precisely one of the categories SB 403 auto-pay
-- CANNOT reach (it requires CASH). Dropping those silently would discard part
-- of the addressable market.
--
-- NAUPA type prefixes: SD = safe deposit, SC = securities, IN = insurance,
-- MI = mineral interests, CT = court deposits.
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

-- properties_workable and properties_priority are recreated here to use it.
-- See the deployed definitions; the only change is the non-cash predicate and
-- the NAUPA-type branches in priority_reason.
