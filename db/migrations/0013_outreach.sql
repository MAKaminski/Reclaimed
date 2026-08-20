-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — Outreach: campaigns, sends, and suppression.
--
-- DIRECT MAIL IS THE PRIMARY CHANNEL. No autodialer, no SMS blast. Cold
-- outbound with no prior express written consent is the largest UNCAPPED
-- liability in this model — TCPA $500/violation, trebled to $1,500 willful.
-- Direct mail carries no TCPA exposure at all.
-- ═══════════════════════════════════════════════════════════════════════════

create type outreach_channel as enum ('mail', 'email', 'phone', 'sms');
create type campaign_status as enum ('draft', 'approved', 'sending', 'sent', 'halted');

create type suppression_reason as enum (
  'opted_out', 'deceased', 'do_not_call_registry', 'bad_address',
  'complaint', 'litigation_hold', 'staff_judgement'
);

-- ONE table, checked by EVERY sender. There is deliberately NO channel column:
-- an opt-out received by post suppresses email too. The TCPA revocation waiver
-- expired in April 2026, so cross-channel any-reasonable-method revocation is a
-- hard requirement.
create table suppressions (
  id            bigint generated always as identity primary key,
  identifier    text not null,
  identifier_kind text not null check (identifier_kind in ('email','phone','postal','owner_name','property_id')),
  reason        suppression_reason not null,
  suppressed_at timestamptz not null default now(),
  suppressed_by uuid references staff (id),
  source_note   text,
  unique (identifier, identifier_kind)
);

comment on table suppressions is
  'Cross-channel and permanent by design. No channel column: an opt-out received by post suppresses email as well.';

alter table suppressions enable row level security;
create policy suppressions_staff_read on suppressions
  for select to authenticated using (is_active_staff());
create policy suppressions_staff_write on suppressions
  for insert to authenticated with check (is_active_staff());
-- A suppression that can be lifted is not a suppression.
create rule suppressions_no_delete as on delete to suppressions do instead nothing;
create rule suppressions_no_update as on update to suppressions do instead nothing;

create table outreach_campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  channel         outreach_channel not null,
  status          campaign_status not null default 'draft',
  template_id     text not null,
  template_version text not null,

  legend_sha256   text not null,
  legend_point_size integer not null,
  body_max_point_size integer not null,
  -- § 44-12-239(f) "whichever is larger" is COMPUTED, not a constant.
  constraint legend_size_computed check (
    legend_point_size = greatest(12, body_max_point_size + 1)
  ),

  physical_postal_address text,
  opt_out_mechanism text,

  cdr_registration_number text not null,
  approved_by     uuid references staff (id),
  approved_at     timestamptz,
  created_by      uuid not null references staff (id),
  created_at      timestamptz not null default now(),

  constraint email_requires_can_spam check (
    channel <> 'email' or (physical_postal_address is not null and opt_out_mechanism is not null)
  ),
  constraint no_sms_or_phone check (channel in ('mail', 'email'))
);

comment on constraint no_sms_or_phone on outreach_campaigns is
  'SMS is not implemented and phone is feature-flagged off. TCPA $500/violation trebled to $1,500 willful.';

alter table outreach_campaigns enable row level security;
create policy campaigns_staff_read on outreach_campaigns
  for select to authenticated using (is_active_staff());
create policy campaigns_staff_write on outreach_campaigns
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));

create table outreach_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references outreach_campaigns (id),
  property_id   text not null,
  channel       outreach_channel not null,
  recipient_identifier text not null,
  recipient_kind text not null,
  -- Proof the suppression list was consulted for THIS send.
  suppression_checked_at timestamptz not null,
  -- The exact bytes sent, so what the owner received is never in doubt.
  rendered_sha256 text not null,
  sent_at       timestamptz not null default now(),
  sent_by       uuid references staff (id)
);

create index outreach_sends_property_idx on outreach_sends (property_id, sent_at desc);
create index outreach_sends_recipient_idx on outreach_sends (recipient_identifier);

alter table outreach_sends enable row level security;
create policy sends_staff_read on outreach_sends
  for select to authenticated using (is_active_staff());
create policy sends_staff_write on outreach_sends
  for insert to authenticated with check (is_active_staff());
create rule sends_no_delete as on delete to outreach_sends do instead nothing;
create rule sends_no_update as on update to outreach_sends do instead nothing;

create or replace function may_send(p_property_id text, p_identifier text, p_kind text)
returns table (permitted boolean, reasons text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare why text[] := array[]::text[];
begin
  if exists (select 1 from suppressions s
             where s.identifier = p_identifier and s.identifier_kind = p_kind) then
    why := why || 'Recipient is suppressed. Suppression is cross-channel and permanent.'::text;
  end if;

  if exists (select 1 from suppressions s
             where s.identifier = p_property_id and s.identifier_kind = 'property_id') then
    why := why || 'Property is suppressed.'::text;
  end if;

  if exists (select 1 from property_holds h
             where h.property_id = p_property_id and h.released_at is null) then
    why := why || 'Property has an active hold - it may have been claimed already.'::text;
  end if;

  if not exists (select 1 from properties p
                 where p.property_id = p_property_id and p.retired_at is null) then
    why := why || 'Property is retired or unknown.'::text;
  end if;

  return query select (array_length(why, 1) is null),
    case when array_length(why, 1) is null
         then array['Permitted: not suppressed, no hold, property live.']::text[]
         else why end;
end;
$$;

revoke all on function may_send(text, text, text) from public, anon;
grant execute on function may_send(text, text, text) to authenticated;
