-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — surface what 0026 started collecting.
--
-- 0026 mapped NUMBER_OF_PENDING_CLAIMS and excluded contested rows from
-- properties_workable. That is the right behaviour and it is INVISIBLE: rows
-- silently leave the workable tier and no screen says why or how many.
--
-- Silent filtering is how a pipeline loses trust. Someone eventually asks why a
-- property they can see in Holdings never reaches the queue, and "a predicate
-- you cannot see removed it" is not an answer. So the inventory now reports:
--
--   contested_rows          a claim is already in flight — excluded from workable
--   previously_paid_rows    paid out at least once before
--   owner_count_disputes    the state's own owner count disagrees with the one
--                           derived from row multiplicity in 0024
--
-- Against California's real file these read 119, 76 and 1 of 3,433. The last is
-- a data-quality meter rather than a filter: it is property 10807126, which
-- declares two owners and ships one row. If a future load makes that number
-- jump, the multi-owner collapse has broken and this is where it shows first.
--
-- The three columns are APPENDED to the outer select rather than grouped with
-- the other counts, because CREATE OR REPLACE VIEW may only add columns at the
-- end — inserting mid-list renames every column after the insertion point and
-- Postgres refuses outright. Readability loses to replaceability here.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view acquisition_inventory as
WITH live AS (
         SELECT COALESCE(properties.source_key, '(unattributed)'::text) AS source_key,
            count(*) FILTER (WHERE properties.retired_at IS NULL) AS live_rows,
            count(*) FILTER (WHERE properties.retired_at IS NOT NULL) AS retired_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.owner_count > 1) AS multi_owner_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.owner_class = 'entity'::property_owner_class) AS entity_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.cash_amount_cents IS NOT NULL) AS valued_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.cash_amount_cents >= 50000) AS above_autopay_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.pending_claims_count > 0) AS contested_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.paid_claims_count > 0) AS previously_paid_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND properties.declared_owner_count IS DISTINCT FROM properties.owner_count) AS owner_count_disputes,
            sum(properties.cash_amount_cents) FILTER (WHERE properties.retired_at IS NULL) AS total_cash_cents,
            max(properties.cash_amount_cents) FILTER (WHERE properties.retired_at IS NULL) AS max_cash_cents,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND enforceable_on(properties.delivery_precision, properties.delivered_to_state_at, properties.year_reported) IS NOT NULL) AS dated_rows,
            count(*) FILTER (WHERE properties.retired_at IS NULL AND enforceable_on(properties.delivery_precision, properties.delivered_to_state_at, properties.year_reported) <= CURRENT_DATE) AS past_window_rows,
            min(properties.first_seen_at) AS first_loaded_at,
            max(properties.last_seen_at) AS last_seen_at
           FROM properties
          GROUP BY (COALESCE(properties.source_key, '(unattributed)'::text))
        ), workable AS (
         SELECT COALESCE(p.source_key, '(unattributed)'::text) AS source_key,
            count(*) AS workable_rows
           FROM properties_workable w_1
             JOIN properties p ON p.property_id = w_1.property_id
          GROUP BY (COALESCE(p.source_key, '(unattributed)'::text))
        )
 SELECT l.source_key,
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
    COALESCE(w.workable_rows, 0::bigint) AS workable_rows,
        CASE
            WHEN l.live_rows = 0 THEN NULL::text
            WHEN COALESCE(w.workable_rows, 0::bigint) > 0 THEN NULL::text
            WHEN l.dated_rows = 0 THEN 'no_delivery_date'::text
            WHEN l.past_window_rows = 0 THEN 'inside_dor_window'::text
            WHEN l.above_autopay_rows = 0 THEN 'below_autopay_ceiling'::text
            ELSE 'other_filter'::text
        END AS workable_blocked_by,
    l.contested_rows,
    l.previously_paid_rows,
    l.owner_count_disputes
   FROM live l
     LEFT JOIN workable w ON w.source_key = l.source_key;

-- security_invoker restated: this view reads `properties` and is therefore an
-- RLS boundary. CREATE OR REPLACE carries reloptions forward, but 0025 shipped
-- without it once and the cost of restating it is one line.
alter view acquisition_inventory set (security_invoker = true);

notify pgrst, 'reload schema';
