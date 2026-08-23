-- ─────────────────────────────────────────────────────────────────────────────
-- 0030 — the workable value floor moves from $500 to $250.
--
-- The $500 floor was set to the SB 403 auto-pay ceiling: § 44-12-220(d.1)(1) has
-- Georgia paying sole-owner cash at or under $500 directly, so that tier read as
-- unaddressable. That reasoning is still right about WHY the tier is thin and
-- wrong about where the economic floor sits.
--
-- Fully-loaded cost of a closed claim is ~$48-49 once the Prove phase is
-- automated, so at the 30% cap break-even is a $163 claim and a $300 claim
-- carries roughly 46% gross margin. The floor was three times too conservative.
--
-- TWO THINGS DELIBERATELY NOT CHANGED:
--
--   1. `cash_above_autopay_ceiling` keeps its > 50000 test. That label names the
--      STATUTORY ceiling, not our business floor, and the two have just stopped
--      being the same number. Moving it would make the label lie. The new
--      $250-$500 band gets its own reason, `cash_below_autopay_ceiling`.
--
--   2. `likely_auto_paid_by_dor` is untouched and becomes MORE important, because
--      lowering the floor re-admits precisely the sole-owner cash tier the state
--      is designed to pay for free. What survives auto-pay in that band is the
--      hard tail — no recent Georgia return, movers, decedents, entities. That
--      flag is how the queue tells them apart, and it is what makes a lower floor
--      safe rather than noisy.
--
-- Verified against synthetic rows in a rolled-back transaction rather than by
-- waiting for the board to move, because it changes no count today: a $300
-- sole-owner row became workable and carried likely_auto_paid_by_dor = true with
-- reason `cash_below_autopay_ceiling`; a $300 joint row became workable as
-- `multi_owner`; a $200 row stayed out. work_queue held at 4 throughout — it
-- INNER JOINs property_scores_latest, so a newly workable property still has to
-- be scored before it appears.
-- ─────────────────────────────────────────────────────────────────────────────

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
  WHERE retired_at IS NULL AND COALESCE(pending_claims_count, 0) = 0 AND enforceable_on(delivery_precision, delivered_to_state_at, year_reported) <= CURRENT_DATE AND (cash_amount_cents >= 25000 OR cash_amount_cents IS NULL AND is_material_non_cash(naupa_property_type, cusip, share_count, safe_deposit_contents)) AND NOT (EXISTS ( SELECT 1
           FROM property_holds h
          WHERE h.property_id = p.property_id AND h.released_at IS NULL)) AND NOT (EXISTS ( SELECT 1
           FROM agreements a
          WHERE (p.property_id = ANY (a.property_ids)) AND (a.status = ANY (ARRAY['draft'::agreement_status, 'sent_for_signature'::agreement_status, 'signed'::agreement_status, 'submitted'::agreement_status])))) AND NOT (EXISTS ( SELECT 1
           FROM suppressions s
          WHERE s.identifier_kind = 'property_id'::text AND s.identifier = p.property_id OR s.identifier_kind = 'owner_name'::text AND p.owner_name IS NOT NULL AND s.identifier = lower(regexp_replace(p.owner_name, '\s+'::text, ' '::text, 'g'::text))));
;

alter view properties_workable set (security_invoker = true);

create or replace view properties_priority as
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
    enforceable_on,
    likely_auto_paid_by_dor,
        CASE
            WHEN owner_class = 'multi_owner'::property_owner_class THEN 'multi_owner'::text
            WHEN owner_class = 'entity'::property_owner_class THEN 'entity_owned'::text
            WHEN cusip IS NOT NULL OR share_count IS NOT NULL OR naupa_property_type ~* '^SC[0-9]'::text THEN 'securities'::text
            WHEN safe_deposit_contents IS NOT NULL OR naupa_property_type ~* '^SD[0-9]'::text THEN 'safe_deposit'::text
            WHEN cash_amount_cents > 50000 THEN 'cash_above_autopay_ceiling'::text
            WHEN cash_amount_cents > 25000 THEN 'cash_below_autopay_ceiling'::text
            ELSE 'other'::text
        END AS priority_reason
   FROM properties_workable w
  WHERE (owner_class = ANY (ARRAY['multi_owner'::property_owner_class, 'entity'::property_owner_class])) OR cusip IS NOT NULL OR share_count IS NOT NULL OR safe_deposit_contents IS NOT NULL OR naupa_property_type ~* '^(SD|SC|IN|MI|CT)[0-9]'::text OR cash_amount_cents > 25000;
;

alter view properties_priority set (security_invoker = true);

notify pgrst, 'reload schema';
