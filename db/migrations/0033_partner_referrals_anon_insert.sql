-- 0033 — anon may INSERT a referral and may never read one. Applied 2026-08-23
-- via MCP; file written 2026-09-21. A readable referrals table would confirm
-- whether a name is known to us — a lookup by another route (§ 44-12-239.1(b)).
-- Rate limiting at the edge is not built; the route is closed on registration.

grant insert on partner_referrals to anon;

create policy partner_referrals_anon_insert on partner_referrals
  for insert to anon
  with check (
    claimant_consent_attested
    and status = 'received'
    and triaged_at is null
    and triaged_by is null
  );

notify pgrst, 'reload schema';
