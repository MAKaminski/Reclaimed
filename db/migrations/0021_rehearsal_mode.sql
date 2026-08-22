-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Rehearsal mode: exercise the whole pipeline without transmitting.
--
-- A COMPLIANCE GATE stops something LEAVING THE BUILDING. There are exactly
-- two: a solicitation reaching an owner, and a claim reaching DOR. Both are
-- § 44-12-239.2(a)(10) acts at up to $2,000 each.
--
-- EVERYTHING ELSE IS PRODUCT — scoring, locating, chain-building, agreement
-- generation, recording a signature, assembling a claim packet, reconciling a
-- receipt — and runs now.
--
-- is_rehearsal DEFAULTS TRUE, so forgetting to set it yields a harmless
-- practice run rather than an unregistered solicitation.
-- ═══════════════════════════════════════════════════════════════════════════

alter table agreements        add column is_rehearsal boolean not null default true;
alter table outreach_sends    add column is_rehearsal boolean not null default true;
alter table claim_submissions add column is_rehearsal boolean not null default true;
alter table claims            add column is_rehearsal boolean not null default true;

comment on column agreements.is_rehearsal is
  'TRUE means generated before CDR registration: practice only, never to be printed and posted. A rehearsal UP-CDR2 is a perfectly-formed agreement, so mailing one WOULD be an unregistered solicitation. The PDF is watermarked for exactly this reason.';

-- A practice run must not become real by flipping one flag.
create or replace function assert_claim_matches_agreement()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare agr_rehearsal boolean;
begin
  select is_rehearsal into agr_rehearsal from agreements where id = new.agreement_id;
  if agr_rehearsal is null then return new; end if;
  if not new.is_rehearsal and agr_rehearsal then
    raise exception
      'Refusing to file a LIVE claim against a REHEARSAL agreement. It was generated before registration and never signed by a claimant. Generate a fresh agreement once registration is active.';
  end if;
  return new;
end;
$$;

create trigger claims_match_agreement
  before insert or update on claims
  for each row execute function assert_claim_matches_agreement();

create or replace function assert_submission_matches_claim()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare claim_rehearsal boolean;
begin
  select is_rehearsal into claim_rehearsal from claims where id = new.claim_id;
  if claim_rehearsal is null then return new; end if;
  if not new.is_rehearsal and claim_rehearsal then
    raise exception 'Refusing to record a LIVE submission for a REHEARSAL claim.';
  end if;
  return new;
end;
$$;

create trigger submissions_match_claim
  before insert on claim_submissions
  for each row execute function assert_submission_matches_claim();

revoke all on function assert_claim_matches_agreement() from public, anon, authenticated;
revoke all on function assert_submission_matches_claim() from public, anon, authenticated;

-- Per gate: what it unlocks, what it blocks today, whether the path is still
-- exercisable in rehearsal, and the penalty for getting it wrong.
create or replace function compliance_gates()
returns table (
  gate_key text, gate_name text, statute text, unlocks text[],
  blocked_today text[], available_in_rehearsal boolean, penalty text
)
language sql stable
set search_path = public, pg_temp
as $$
  select * from (values
    ('cdr_registration', 'CDR registration with the Georgia DOR',
     'O.C.G.A. 44-12-239 / 44-12-239.2(a)(10)',
     array['Soliciting owners - posting a letter to an apparent owner',
           'Entering into a recovery agreement with a claimant',
           'Filing a claim with the Department',
           'Receiving distribution of fees and costs',
           'Obtaining the weekly DOR unclaimed-property database']::text[],
     array['Sending the solicitation (stage 4)',
           'Sending the agreement to a claimant (stage 5)',
           'Filing the claim with DOR (stage 8)']::text[],
     true,
     'Up to $2,000 PER ACT, revocation with a bar on reapplying, prohibition on holding office at any CDR employer, and referral to the Attorney General.'),
    ('designated_agent', 'Designated agent, screened under 44-12-239(d)',
     'O.C.G.A. 44-12-239(d)',
     array['Submitting or processing a claim on the CDR''s behalf']::text[],
     array['Filing the claim with DOR (stage 8)']::text[],
     true,
     'A single unscreened designation is entity-fatal: it disqualifies the whole registration, not just the person.'),
    ('legend_verified', 'Solicitation legend byte-verified against the enrolled act',
     'O.C.G.A. 44-12-239(f)',
     array['Rendering any owner-facing document']::text[],
     array[]::text[], false,
     'A defective solicitation is reachable under 44-12-239.2(a)(5) at up to $2,000 per act. Currently VERIFIED against enrolled SB 103.'),
    ('authority_chain', 'Authority chain established and reviewed',
     'O.C.G.A. 44-12-224(b)',
     array['Generating an agreement', 'Filing a claim']::text[],
     array[]::text[], false,
     'Not a registration gate - a per-claim evidentiary one. A defective agreement voids the representative''s claim. Every forged-POA prosecution in this industry failed here.'),
    ('dor_data', 'Access to the weekly DOR bulk file',
     'O.C.G.A. 44-12-239.1(a)',
     array['Real property data to work']::text[],
     array['Working real owners rather than fixtures']::text[], true,
     'Delivered to registered CDRs only. Until then the pipeline runs on synthetic fixtures, which exercise every code path identically.')
  ) as t(gate_key, gate_name, statute, unlocks, blocked_today,
         available_in_rehearsal, penalty);
$$;

revoke all on function compliance_gates() from public, anon;
grant execute on function compliance_gates() to authenticated;
