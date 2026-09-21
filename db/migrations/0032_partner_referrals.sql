-- 0032 — inbound partner referrals. Applied 2026-08-23 via MCP; file written
-- 2026-09-21 after the omission was found. Data arrives, nothing leaves:
-- § 44-12-239.1(b) forecloses any read/lookup surface, so there is no read
-- endpoint and anon gets INSERT only (0033). Accepting a referral is contact
-- capture, so the route is gated on registration (ADR-0010).

create type referral_status as enum ('received', 'accepted', 'declined', 'withdrawn');

create table partner_referrals (
  id                        uuid primary key default gen_random_uuid(),
  reference                 text not null unique,          -- partner idempotency key
  partner_name              text not null,
  partner_email             text not null,
  partner_registration      text,
  jurisdiction              char(2) not null,
  claimant_name             text not null,
  claimant_kind             text not null,
  relationship              text not null,
  property_description      text,                          -- never a property_id
  estimated_value_cents     bigint,
  claimant_consent_attested boolean not null,
  status                    referral_status not null default 'received',
  received_at               timestamptz not null default now(),
  triaged_at                timestamptz,
  triaged_by                uuid references staff(id),
  note                      text,
  constraint partner_referrals_value_nonneg
    check (estimated_value_cents is null or estimated_value_cents >= 0),
  constraint partner_referrals_consent_required
    check (claimant_consent_attested)
);

create index partner_referrals_status_idx on partner_referrals (status, received_at desc);

alter table partner_referrals enable row level security;

create policy partner_referrals_staff_read on partner_referrals
  for select to authenticated using (is_active_staff());

create policy partner_referrals_staff_write on partner_referrals
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));

create rule partner_referrals_no_delete as
  on delete to partner_referrals do instead nothing;

notify pgrst, 'reload schema';
