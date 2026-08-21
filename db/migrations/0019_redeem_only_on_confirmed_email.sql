-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Redeem only on a CONFIRMED email, in both paths.
--
-- redeem_my_invite() (0018) requires email_confirmed_at. The INSERT trigger from
-- 0016 did not, so simply TYPING an invited address into the sign-in box created
-- the staff row immediately — before the person had proved they control it.
--
-- Not a privilege escalation: no session is possible without clicking the link
-- sent to that address. But it consumed the invitation and listed someone in
-- /staff who had never signed in — a misleading answer to "who may act for this
-- CDR", which is a § 44-12-239(d) question and should not rest on an unproven
-- assertion.
--
-- Account creation now redeems nothing. redeem_my_invite() redeems on first
-- CONFIRMED sign-in, which is the path that actually proves control.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function redeem_staff_invite()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare inv record;
begin
  if new.email_confirmed_at is null then return new; end if;

  select * into inv from staff_invites
  where email = new.email and accepted_at is null and revoked_at is null limit 1;
  if inv is null then return new; end if;

  insert into staff (id, email, full_name, role, dor_designated_agent, background_check_cleared_at)
  values (new.id, inv.email, inv.full_name, inv.role, inv.dor_designated_agent, inv.background_check_cleared_at)
  on conflict (id) do nothing;

  update staff_invites set accepted_at = now() where id = inv.id;

  insert into audit_log (actor_label, action, entity_type, entity_id, detail, statute)
  values ('auth', 'staff_invite_redeemed', 'staff', new.id::text,
          jsonb_build_object('email', inv.email, 'role', inv.role,
                             'dor_designated_agent', inv.dor_designated_agent,
                             'redeemed_at', 'account_creation_confirmed'),
          'O.C.G.A. 44-12-239(d)');
  return new;
end;
$$;

revoke all on function redeem_staff_invite() from public, anon, authenticated;
