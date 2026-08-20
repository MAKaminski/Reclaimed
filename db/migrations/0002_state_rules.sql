-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — The compliance rules engine. Rules are DATA, not code.
--
-- Georgia is verified. Every other state is present but BLOCKED. Any workflow
-- touching a rule with status <> 'verified' must fail loudly — never default
-- silently. Published aggregator fee tables were spot-checked and found
-- materially WRONG on GA, VA, MD, IN, CA and MI.
-- ═══════════════════════════════════════════════════════════════════════════

create type rule_status as enum (
  'verified',
  'researched_not_verified_for_build',
  'blocked'
);

create table state_rules (
  code            char(2) primary key,
  status          rule_status not null default 'blocked',
  name            text,
  -- Percentage points, e.g. 30 for 30%. Null means NO statutory cap, which is
  -- materially different from zero and must never be coerced to a default.
  fee_cap_pct     numeric(5,2),
  fee_cap_absolute_cents bigint,
  costs_count_toward_cap boolean,
  cap_basis       text,
  unenforceability_days integer,
  max_properties_per_recovery_agreement integer,
  max_properties_per_purchase_agreement integer,
  requires_notary boolean,
  ron_available   boolean,
  owner_must_sign_personally boolean,
  advance_fees_permitted boolean,
  registration_required boolean,
  registration_fee_cents bigint,
  registration_term_years integer,
  data_redistribution_permitted boolean,
  payee_model     text,
  custom_terms_threshold_cents bigint,
  -- The full seed row, so nothing researched is lost to schema drift.
  raw             jsonb not null,
  citation        text,
  verified_at     date,
  loaded_at       timestamptz not null default now()
);

comment on column state_rules.fee_cap_pct is
  'NULL means the state has NO statutory percentage cap (e.g. MD, WA, CO). This '
  'is NOT the same as zero and must never be defaulted. Any workflow reaching a '
  'row whose status <> ''verified'' must throw.';

-- Guardrail: a state cannot be marked verified without the facts that make it
-- safe to act on. This is the database refusing to hold a half-researched rule.
alter table state_rules add constraint verified_rules_are_complete check (
  status <> 'verified' or (
    advance_fees_permitted is not null
    and costs_count_toward_cap is not null
    and data_redistribution_permitted is not null
    and payee_model is not null
    and verified_at is not null
    and citation is not null
  )
);

alter table state_rules enable row level security;

create policy state_rules_staff_read on state_rules
  for select to authenticated using (is_active_staff());

create policy state_rules_admin_write on state_rules
  for all to authenticated
  using (has_staff_role(array['admin']::staff_role[]))
  with check (has_staff_role(array['admin']::staff_role[]));

-- Changing a fee cap is a compliance event. Record it before it is questioned.
create or replace function log_state_rule_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (
    auth.uid(),
    tg_op,
    'state_rules',
    coalesce(new.code, old.code),
    jsonb_build_object(
      'old', to_jsonb(old) - 'raw',
      'new', to_jsonb(new) - 'raw'
    ),
    'O.C.G.A. § 44-12-224(d)(1)'
  );
  return new;
end;
$$;

create trigger state_rules_audit
  after insert or update on state_rules
  for each row execute function log_state_rule_change();
