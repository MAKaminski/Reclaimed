-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Complete the workability predicates.
--
-- 0004/0008 defined properties_workable with only the property-intrinsic
-- predicates, because `agreements` and `suppressions` did not yet exist and a
-- forward reference is impossible. Both now exist, so the deferred predicates
-- are added: not under a live agreement of ours, and not suppressed.
--
-- Without these, a property already under a signed agreement would keep
-- surfacing in the work queue and could be solicited again.
-- ═══════════════════════════════════════════════════════════════════════════

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
  )
  and not exists (
    select 1 from agreements a
    where p.property_id = any(a.property_ids)
      and a.status in ('draft', 'sent_for_signature', 'signed', 'submitted')
  )
  and not exists (
    select 1 from suppressions s
    where (s.identifier_kind = 'property_id' and s.identifier = p.property_id)
       or (s.identifier_kind = 'owner_name'
           and p.owner_name is not null
           and s.identifier = lower(regexp_replace(p.owner_name, '\s+', ' ', 'g')))
  );
