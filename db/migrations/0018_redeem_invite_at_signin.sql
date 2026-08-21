-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Redeem an invite at SIGN-IN, not only at account creation.
--
-- Two ordering bugs made the invite flow unusable:
--
--   1. The client passed shouldCreateUser: false, so Supabase refused to create
--      the auth.users row — and the redemption trigger fires ON that insert.
--      An invited person could never sign in at all ("Signups not allowed for
--      otp"). The guard did the opposite of its intent.
--
--   2. Even with creation allowed, anyone who signed in BEFORE their invite was
--      issued would never redeem it: the INSERT already happened and the trigger
--      never fires again.
--
-- Redemption is therefore idempotent and runs at session resolution. Allowing
-- account creation is safe because AN ACCOUNT IS NOT ACCESS: without a `staff`
-- row every RLS policy denies, and only an open invite matching the caller's own
-- VERIFIED address creates one.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function redeem_my_invite()
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  me  record;
  inv record;
begin
  -- auth.uid() comes from the verified JWT, so a caller cannot claim an invite
  -- for an address they do not control.
  select id, email, email_confirmed_at into me from auth.users where id = auth.uid();
  if me is null then return false; end if;

  -- An UNVERIFIED address must not redeem, or someone could register an address
  -- they do not own and collect an invite meant for its real owner.
  if me.email_confirmed_at is null then return false; end if;

  if exists (select 1 from staff where id = me.id) then return true; end if;

  select * into inv from staff_invites
   where email = me.email and accepted_at is null and revoked_at is null limit 1;
  if inv is null then return false; end if;  -- signed in, not authorised: normal

  insert into staff (id, email, full_name, role, dor_designated_agent, background_check_cleared_at)
  values (me.id, inv.email, inv.full_name, inv.role, inv.dor_designated_agent, inv.background_check_cleared_at)
  on conflict (id) do nothing;

  update staff_invites set accepted_at = now() where id = inv.id;

  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (me.id, 'staff_invite_redeemed', 'staff', me.id::text,
          jsonb_build_object('email', inv.email, 'role', inv.role,
                             'dor_designated_agent', inv.dor_designated_agent,
                             'redeemed_at', 'sign_in'),
          'O.C.G.A. 44-12-239(d)');
  return true;
end;
$$;

revoke all on function redeem_my_invite() from public, anon;
grant execute on function redeem_my_invite() to authenticated;

comment on function redeem_my_invite is
  'Idempotent. Creates the caller''s staff row IF an open invite matches their own VERIFIED email. Safe as SECURITY DEFINER because auth.uid() comes from the verified JWT.';
