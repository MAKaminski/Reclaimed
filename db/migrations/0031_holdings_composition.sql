-- ─────────────────────────────────────────────────────────────────────────────
-- 0031 — what the holdings are MADE OF, not just how many there are.
--
-- Asked directly: why surface property type, holder and owner class at all?
-- Because those three are not descriptive metadata, they are the fields that
-- decide whether a record is reachable and what proving it costs:
--
--   owner_class    decides whether the STATE pays it out for free. SB 403
--                  auto-pay (§ 44-12-220(d.1)(1)) reaches sole-owner natural-
--                  person cash only, so `multi_owner` and `entity` sit
--                  structurally outside it. Georgia is draining the tier we
--                  cannot serve and leaving the tier we can — the class mix IS
--                  the addressable market.
--
--   property type  decides the documentary burden and whether it is cash at all.
--                  Securities carry a CUSIP and a valuation date and may already
--                  have been sold; safe deposit contents are often auctioned and
--                  replaced by proceeds. Type also drives is_material_non_cash(),
--                  the only route by which a NULL-valued row becomes workable.
--
--   holder         decides leverage and provenance difficulty. One holder with
--                  hundreds of records is one documentation practice to learn
--                  rather than hundreds. Against California's file, MetLife alone
--                  reported 407 of 3,433 records.
--
-- One view rather than three so a page costs one round trip. `dimension` is the
-- discriminator; callers filter on it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view holdings_composition as
 SELECT 'holder'::text AS dimension,
    COALESCE(properties.source_key, '(unattributed)'::text) AS source_key,
    COALESCE(properties.holder_name, '(not reported)'::text) AS label,
    count(*) AS rows,
    COALESCE(sum(properties.cash_amount_cents), 0::numeric)::bigint AS total_cents,
    count(*) FILTER (WHERE properties.owner_count > 1) AS multi_owner_rows,
    count(*) FILTER (WHERE properties.owner_class = 'entity'::property_owner_class) AS entity_rows
   FROM properties
  WHERE properties.retired_at IS NULL
  GROUP BY 'holder'::text, (COALESCE(properties.source_key, '(unattributed)'::text)), (COALESCE(properties.holder_name, '(not reported)'::text))
UNION ALL
 SELECT 'type'::text AS dimension,
    COALESCE(properties.source_key, '(unattributed)'::text) AS source_key,
    COALESCE(properties.naupa_property_type, '(not reported)'::text) AS label,
    count(*) AS rows,
    COALESCE(sum(properties.cash_amount_cents), 0::numeric)::bigint AS total_cents,
    count(*) FILTER (WHERE properties.owner_count > 1) AS multi_owner_rows,
    count(*) FILTER (WHERE properties.owner_class = 'entity'::property_owner_class) AS entity_rows
   FROM properties
  WHERE properties.retired_at IS NULL
  GROUP BY 'type'::text, (COALESCE(properties.source_key, '(unattributed)'::text)), (COALESCE(properties.naupa_property_type, '(not reported)'::text))
UNION ALL
 SELECT 'class'::text AS dimension,
    COALESCE(properties.source_key, '(unattributed)'::text) AS source_key,
    properties.owner_class::text AS label,
    count(*) AS rows,
    COALESCE(sum(properties.cash_amount_cents), 0::numeric)::bigint AS total_cents,
    count(*) FILTER (WHERE properties.owner_count > 1) AS multi_owner_rows,
    count(*) FILTER (WHERE properties.owner_class = 'entity'::property_owner_class) AS entity_rows
   FROM properties
  WHERE properties.retired_at IS NULL
  GROUP BY 'class'::text, (COALESCE(properties.source_key, '(unattributed)'::text)), (properties.owner_class::text);
;

-- security_invoker: this view reads `properties` and is therefore an RLS
-- boundary. Without it the view would run as its owner and hand aggregate
-- CDR-derived data to any authenticated user with no staff row.
alter view holdings_composition set (security_invoker = true);

grant select on holdings_composition to authenticated;

notify pgrst, 'reload schema';
