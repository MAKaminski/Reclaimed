-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 — Agreements.
--
-- § 44-12-224(b): using the wrong form, or a defective one, VOIDS the
-- representative's claim. An agreement row therefore carries a FROZEN SNAPSHOT
-- of the fee computation, the rules version, and the form hash — if the law or
-- the form changes, a historical agreement must still render exactly as signed.
-- ═══════════════════════════════════════════════════════════════════════════

create type agreement_form as enum ('UP-CDR2', 'UP-CDR3', 'UP-CDR4');
create type agreement_status as enum (
  'draft', 'sent_for_signature', 'signed', 'submitted', 'revoked', 'void'
);
create type signature_mode as enum (
  'wet_ink', 'esign_ron_out_of_state', 'esign_ga_attorney_notary'
);

create table agreements (
  id              uuid primary key default gen_random_uuid(),
  form            agreement_form not null,
  status          agreement_status not null default 'draft',
  signature_mode  signature_mode not null default 'wet_ink',
  property_ids    text[] not null check (cardinality(property_ids) > 0),

  form_sha256     text not null,
  rules_version   text not null,
  fee_snapshot    jsonb not null,
  fee_pct         numeric(5,2) not null,
  fee_cents       bigint not null,
  net_to_claimant_cents bigint,
  path            char(1) not null check (path in ('A','B')),

  claimant_name   text not null,
  claimant_mailing_address text not null,
  claimant_tax_id text,
  cdr_identification_number text not null,

  custom_terms    text,
  addendum_agreement_id uuid references agreements (id),
  generated_pdf_path text,
  generated_pdf_sha256 text,

  created_by      uuid not null references staff (id),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  signed_at       timestamptz,
  submitted_at    timestamptz,
  -- § 44-12-224(e): the claimant may revoke at any time, and the CDR has an
  -- AFFIRMATIVE DUTY to inform DOR of an effective revocation.
  revoked_at      timestamptz,
  revocation_reported_to_dor_at timestamptz,

  constraint recovery_property_limit check (
    form <> 'UP-CDR2' or cardinality(property_ids) <= 15
  ),
  constraint purchase_property_limit check (
    form <> 'UP-CDR4' or cardinality(property_ids) <= 5
  )
);

comment on column agreements.claimant_mailing_address is
  'WRITE-LOCKED once sent. This is the address DOR pays the claimant at under 44-12-220(d)(3). Every criminal prosecution in this industry involved redirecting it.';

comment on column agreements.fee_snapshot is
  'Frozen computeFee() output. NEVER recomputed - if the cap or the rules change, a historical agreement must still render exactly as signed.';

create index agreements_status_idx on agreements (status, created_at desc);
create index agreements_property_idx on agreements using gin (property_ids);

alter table agreements enable row level security;
create policy agreements_staff_read on agreements
  for select to authenticated using (is_active_staff());
create policy agreements_staff_write on agreements
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));
create rule agreements_no_delete as on delete to agreements do instead nothing;

create or replace function freeze_agreement_after_send()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.sent_at is null then return new; end if;

  if new.property_ids is distinct from old.property_ids then
    raise exception
      'Property set is immutable once the agreement has been sent. No property may be added to the form after it has been received - issue a new agreement.';
  end if;

  if new.claimant_mailing_address is distinct from old.claimant_mailing_address then
    raise exception
      'Claimant mailing address is WRITE-LOCKED to the signed agreement (O.C.G.A. 44-12-220(d)(3)). DOR pays the claimant at this address. A change requires a RE-SIGNED agreement, not an edit.';
  end if;

  if new.fee_snapshot is distinct from old.fee_snapshot
     or new.fee_pct is distinct from old.fee_pct
     or new.fee_cents is distinct from old.fee_cents
     or new.form_sha256 is distinct from old.form_sha256 then
    raise exception
      'Fee snapshot and form hash are frozen at generation. A historical agreement must render exactly as signed.';
  end if;

  return new;
end;
$$;

create trigger agreements_freeze
  before update on agreements
  for each row execute function freeze_agreement_after_send();

create or replace function log_agreement_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (auth.uid(), 'agreement_' || lower(tg_op), 'agreement',
          coalesce(new.id, old.id)::text,
          jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)),
          'O.C.G.A. 44-12-224(b)');
  return new;
end;
$$;

create trigger agreements_audit
  after insert or update on agreements
  for each row execute function log_agreement_change();

revoke all on function freeze_agreement_after_send() from public, anon, authenticated;
revoke all on function log_agreement_change() from public, anon, authenticated;
