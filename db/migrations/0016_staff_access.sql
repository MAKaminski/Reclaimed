-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Staff access: invites, and the § 44-12-239(d) clearance constraint.
--
-- Who may act for the CDR is not an application preference. § 44-12-239(d)
-- disqualifies the CDR or ANY officer, owner, or employee designated to act on
-- its behalf on a conviction within 20 YEARS involving dishonesty, deceit, or
-- fraud, or a civil adjudication of breach of fiduciary duty. Registration is
-- revoked entity-wide for a single bad designation.
-- ═══════════════════════════════════════════════════════════════════════════

-- A designated agent MUST have a recorded clearance date. Ticking the box
-- without the screening IS the § 44-12-239(d) failure, and it is exactly the
-- kind of thing done "temporarily" during onboarding.
alter table staff add constraint designated_agent_requires_clearance check (
  not dor_designated_agent or background_check_cleared_at is not null
);

comment on constraint designated_agent_requires_clearance on staff is
  'A DOR-designated agent cannot exist without a recorded PBSA background-check clearance date. 44-12-239(d) makes a single bad designation entity-fatal.';

-- Access is granted BEFORE the person signs in, by an existing admin. There is
-- deliberately no self-service path: a route that grants staff access on demand
-- hands over the entire § 44-12-239.1(a) file.
create table staff_invites (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  full_name     text not null,
  role          staff_role not null default 'readonly',
  dor_designated_agent boolean not null default false,
  background_check_cleared_at timestamptz,
  invited_by    uuid not null references staff (id),
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  constraint invite_designated_agent_requires_clearance check (
    not dor_designated_agent or background_check_cleared_at is not null
  )
);

create index staff_invites_open_idx on staff_invites (email)
  where accepted_at is null and revoked_at is null;

alter table staff_invites enable row level security;
create policy invites_admin_read on staff_invites
  for select to authenticated using (has_staff_role(array['admin']::staff_role[]));
create policy invites_admin_write on staff_invites
  for all to authenticated
  using (has_staff_role(array['admin']::staff_role[]))
  with check (has_staff_role(array['admin']::staff_role[]));

-- On first sign-in, an open invite becomes a staff row. No invite means no
-- access: the account exists in auth.users and every RLS policy denies it.
create or replace function redeem_staff_invite()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare inv record;
begin
  select * into inv from staff_invites
  where email = new.email and accepted_at is null and revoked_at is null
  limit 1;

  if inv is null then
    return new;  -- not an error: the account is simply not staff
  end if;

  insert into staff (id, email, full_name, role, dor_designated_agent, background_check_cleared_at)
  values (new.id, inv.email, inv.full_name, inv.role, inv.dor_designated_agent, inv.background_check_cleared_at)
  on conflict (id) do nothing;

  update staff_invites set accepted_at = now() where id = inv.id;

  insert into audit_log (actor_label, action, entity_type, entity_id, detail, statute)
  values ('auth', 'staff_invite_redeemed', 'staff', new.id::text,
          jsonb_build_object('email', inv.email, 'role', inv.role,
                             'dor_designated_agent', inv.dor_designated_agent),
          'O.C.G.A. 44-12-239(d)');
  return new;
end;
$$;

create trigger on_auth_user_created_redeem_invite
  after insert on auth.users
  for each row execute function redeem_staff_invite();

revoke all on function redeem_staff_invite() from public, anon, authenticated;

-- Every change to who may act is a compliance event.
create or replace function log_staff_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (auth.uid(), 'staff_' || lower(tg_op), 'staff',
          coalesce(new.id, old.id)::text,
          jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)),
          'O.C.G.A. 44-12-239(d)');
  return new;
end;
$$;

create trigger staff_audit after insert or update on staff
  for each row execute function log_staff_change();

revoke all on function log_staff_change() from public, anon, authenticated;
