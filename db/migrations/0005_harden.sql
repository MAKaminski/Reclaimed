-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Hardening, from the Supabase security advisor.
--
-- This system holds owner PII derived from the § 44-12-239.1(a) CDR file, whose
-- redistribution is prohibited by § 44-12-239.1(b) with violations referred to
-- the Attorney General. Unauthorised read access is not a bug class here, it is
-- an enforcement exposure. The advisor flagged ten findings; this closes eight
-- and documents the two that must remain.
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions out of `public`, so they are not reachable through PostgREST.
create schema if not exists extensions;
alter extension citext set schema extensions;
alter extension pgcrypto set schema extensions;

create or replace function is_active_staff()
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (select 1 from staff where staff.id = auth.uid() and staff.deactivated_at is null);
$$;

create or replace function has_staff_role(required staff_role[])
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (select 1 from staff where staff.id = auth.uid() and staff.deactivated_at is null and staff.role = any(required));
$$;

-- Trigger functions are invoked by the trigger, which does NOT consult EXECUTE
-- privilege. Exposing them at /rest/v1/rpc/ serves no purpose and would let a
-- signed-in user fabricate audit rows and property holds directly.
revoke all on function halt_on_disappearance() from public, anon, authenticated;
revoke all on function log_state_rule_change() from public, anon, authenticated;

-- The staff predicates MUST stay callable by `authenticated`, because RLS policy
-- evaluation invokes them. The advisor still flags this and that is expected:
-- each returns only whether the CALLER is staff, which is not a disclosure.
-- `anon` has no business reaching them at all.
revoke all on function is_active_staff() from public, anon;
revoke all on function has_staff_role(staff_role[]) from public, anon;
grant execute on function is_active_staff() to authenticated;
grant execute on function has_staff_role(staff_role[]) to authenticated;

revoke all on function enforceable_on(delivery_date_precision, date, integer) from public, anon;
grant execute on function enforceable_on(delivery_date_precision, date, integer) to authenticated;

-- ── Fail closed on future tables ───────────────────────────────────────────
-- RLS already denies anon everywhere. But a table added in a later migration
-- WITHOUT an explicit policy would still inherit the schema-level grant. Removing
-- the grant means a future omission fails closed rather than open.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
