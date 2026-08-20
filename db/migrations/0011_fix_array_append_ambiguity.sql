-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — chain_submittable() and heir_claim_ready(), with the
--        `text[] || 'literal'` ambiguity fixed.
--
-- Postgres resolves an untyped string literal on the right of || against
-- anyarray || anyarray BEFORE anyarray || anyelement, so a bare literal is
-- parsed as an ARRAY LITERAL and throws 22P02 "malformed array literal".
--
-- The format(...) branches returned typed text and worked, which is why this
-- surfaced only when the invalidated-evidence branch fired — i.e. when testing
-- the forged-document path, the single most important branch in the function.
-- Every append is now explicitly ::text.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function chain_submittable(p_property_id text)
returns table (
  submittable boolean,
  chain_confidence numeric,
  threshold numeric,
  reasons text[]
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  s   record;
  thr numeric;
  why text[] := array[]::text[];
begin
  select minimum_confidence into thr from chain_thresholds where id;
  select * into s from authority_chain_state where property_id = p_property_id;

  if s is null then
    return query select false, null::numeric, thr,
      array['No authority chain exists for this property. O.C.G.A. 44-12-224(b) voids the representative''s claim on a defective agreement.']::text[];
    return;
  end if;

  if not s.every_link_evidenced then
    why := why || 'A link is asserted without an evidence document.'::text;
  end if;
  if s.has_invalidated_evidence then
    why := why || 'A link rests on evidence later invalidated (forged, superseded, or wrong).'::text;
  end if;
  if s.rejected_links > 0 then
    why := why || format('%s link(s) rejected on review.', s.rejected_links)::text;
  end if;
  if not s.sequence_contiguous then
    why := why || 'Chain sequence has a gap - a step was skipped.'::text;
  end if;
  if s.requires_manual_review then
    why := why || format(
      'Entity status %s is not active. DOR publishes NO dissolved/merged requirements (DOR-QUESTIONS #3); a named human must review.',
      array_to_string(s.entity_statuses, ', '))::text;
  end if;
  if s.unreviewed_links > 0 then
    why := why || format('%s link(s) never reviewed by a second person.', s.unreviewed_links)::text;
  end if;
  if s.chain_confidence < thr then
    why := why || format('Chain confidence %s is below the %s threshold.', s.chain_confidence, thr)::text;
  end if;

  return query select (array_length(why, 1) is null), s.chain_confidence, thr,
    case when array_length(why, 1) is null
         then array['Chain is evidenced, reviewed, contiguous, and above threshold.']::text[]
         else why end;
end;
$$;

create or replace function heir_claim_ready(p_claim_id uuid)
returns table (ready boolean, reasons text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  c   record;
  n_heirs int; n_signed int; n_minor int;
  why text[] := array[]::text[];
  ceiling_cents bigint := 750000;  -- $7,500
begin
  select * into c from heir_claims where id = p_claim_id;
  if c is null then
    return query select false, array['Heir claim not found.']::text[]; return;
  end if;

  select count(*), count(*) filter (where has_signed), count(*) filter (where not is_adult)
    into n_heirs, n_signed, n_minor from heirs where heir_claim_id = p_claim_id;

  if n_heirs = 0 then
    why := why || 'No heirs enumerated. O.C.G.A. 44-12-220(i) requires an affidavit signed by ALL heirs.'::text;
  elsif n_signed < n_heirs then
    why := why || format('Only %s of %s heirs have signed. A partial heir set is NOT an all-heir affidavit.', n_signed, n_heirs)::text;
  end if;

  if n_minor > 0 then
    why := why || format('%s enumerated heir(s) are not adults. 44-12-192(7.1) defines an heir as an ADULT surviving spouse, child, parent, or sibling.', n_minor)::text;
  end if;

  if c.aggregate_value_cents is null then
    why := why || 'Aggregate estate value is unknown; the $7,500 ceiling cannot be tested.'::text;
  elsif c.aggregate_value_cents > ceiling_cents then
    why := why || format('Aggregate %s exceeds the $7,500 ceiling - probate is required, the affidavit path is unavailable.',
      to_char(c.aggregate_value_cents / 100.0, 'FM999,999,990.00'))::text;
  end if;

  if not c.no_probate_pending or not c.no_probate_ever_filed then
    why := why || 'The affidavit path requires that NO Georgia probate proceeding is pending or was EVER filed.'::text;
  end if;
  if not c.funeral_and_claims_paid then
    why := why || 'Affidavit must state that funeral, last-illness, and lawful claims are paid.'::text;
  end if;
  if not c.amicable_division then
    why := why || 'Affidavit must state amicable division among the heirs.'::text;
  end if;
  if c.death_certificate_id is null then
    why := why || 'No death certificate on file.'::text;
  end if;
  if c.testate and c.will_document_id is null then
    why := why || 'Decedent was testate; the will must be attached.'::text;
  end if;

  return query select (array_length(why, 1) is null),
    case when array_length(why, 1) is null
         then array['All heirs enumerated and signed; within the $7,500 ceiling; no probate filed.']::text[]
         else why end;
end;
$$;

revoke all on function chain_submittable(text) from public, anon;
revoke all on function heir_claim_ready(uuid) from public, anon;
grant execute on function chain_submittable(text) to authenticated;
grant execute on function heir_claim_ready(uuid) to authenticated;
