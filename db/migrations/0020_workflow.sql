-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — The claim pipeline: one stage per property, and who owns it.
--
--   RECLAIMED   identify → locate → review chain → contact → send agreement
--               → record signature → file → reconcile
--   CLAIMANT    sign before a notary and post it back   ← NOT a system user
--   DOR         decide, then pay both parties
--
-- The claimant never logs in, and that is a legal constraint rather than a
-- scoping choice: § 44-12-224(c)(7) requires their OWN MANUAL SIGNATURE, the
-- DOR forms require a notary acknowledgment, and Georgia has not enacted
-- general remote online notarization (HB 289 died 2026-04-02).
-- ═══════════════════════════════════════════════════════════════════════════

create type workflow_stage as enum (
  'identified', 'locating', 'chain_review', 'ready_to_contact',
  'contacted', 'agreement_sent', 'signed', 'filed',
  'approved', 'paid', 'closed_lost'
);

create table property_workflow (
  property_id      text primary key,
  stage            workflow_stage not null default 'identified',
  entered_stage_at timestamptz not null default now(),
  assigned_to      uuid references staff (id),
  note             text,
  closed_reason    text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references staff (id)
);

create index property_workflow_stage_idx on property_workflow (stage, entered_stage_at);

comment on table property_workflow is
  'One row per property being worked. The claimant is a counterparty, not a user: their acceptance is a notarised paper agreement that staff record here.';

alter table property_workflow enable row level security;
create policy workflow_staff_read on property_workflow
  for select to authenticated using (is_active_staff());
create policy workflow_staff_write on property_workflow
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));

create or replace function log_workflow_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return new;
  end if;
  new.entered_stage_at := now();
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (auth.uid(), 'workflow_stage_change', 'property',
          coalesce(new.property_id, old.property_id),
          jsonb_build_object('from', old.stage, 'to', new.stage, 'note', new.note),
          'O.C.G.A. 44-12-224');
  return new;
end;
$$;

create trigger property_workflow_audit
  before insert or update on property_workflow
  for each row execute function log_workflow_change();

revoke all on function log_workflow_change() from public, anon, authenticated;

-- Per-stage owner, action, required roles and applicable gates. Read by the UI
-- so "who may do what" has exactly one definition rather than two that drift.
create or replace function workflow_stage_rules()
returns table (
  stage workflow_stage, step_number integer, owner text, action_label text,
  required_roles text[], requires_designated_agent boolean,
  requires_registration boolean, statute text, detail text
)
language sql stable
set search_path = public, pg_temp
as $$
  select * from (values
    ('identified'::workflow_stage, 1, 'Reclaimed', 'Review and prioritise',
     array['admin','analyst']::text[], false, false, 'O.C.G.A. 44-12-239.1(a)',
     'Property appeared in the weekly DOR file and scored into the priority tier. Nothing owner-facing yet.'),
    ('locating', 2, 'Reclaimed', 'Build the authority chain',
     array['admin','analyst']::text[], false, false, 'O.C.G.A. 44-12-224(b)',
     'Establish who may legally sign, with an uploaded evidence document behind every link. No link may be asserted without one.'),
    ('chain_review', 3, 'Reclaimed', 'Review the chain',
     array['admin','reviewer']::text[], false, false, 'O.C.G.A. 44-12-239(d)',
     'A SECOND person checks each link. Self-review does not count. Chain confidence is the minimum of its links, never the mean.'),
    ('ready_to_contact', 4, 'Reclaimed', 'Send the solicitation',
     array['admin','analyst']::text[], false, true, 'O.C.G.A. 44-12-239.2(a)(10)',
     'Direct mail carrying the 44-12-239(f) legend. Soliciting an owner while unregistered is sanctionable at up to $2,000 per act.'),
    ('contacted', 5, 'Reclaimed', 'Generate and post the agreement',
     array['admin','analyst']::text[], false, true, 'O.C.G.A. 44-12-224(b)',
     'UP-CDR2 filled from the real DOR form, fee clamped to 30% inclusive of costs. Generating is available in rehearsal; POSTING is the gated act.'),
    ('agreement_sent', 6, 'Claimant', 'Sign before a notary and return',
     array[]::text[], false, false, 'O.C.G.A. 44-12-224(c)(7)',
     'THE CLAIMANT IS NOT A USER OF THIS SYSTEM. They must sign by hand before a notary and post it back. Georgia has no general remote online notarization.'),
    ('signed', 7, 'Reclaimed', 'Record the signed agreement',
     array['admin','analyst']::text[], false, false, 'O.C.G.A. 44-12-224(c)',
     'Upload the notarised agreement. The claimant''s mailing address becomes write-locked at this point.'),
    ('filed', 8, 'Reclaimed', 'File the claim with DOR',
     array['admin','analyst']::text[], true, true, 'O.C.G.A. 44-12-239(d)',
     'Emailed to ucp.cdr.claims@dor.ga.gov. ONLY a designated agent screened against the 20-year dishonesty bar may file.'),
    ('approved', 9, 'Georgia DOR', 'Awaiting payment',
     array[]::text[], false, false, 'O.C.G.A. 44-12-220(d)(3)',
     'DOR decides within 90 days and pays BOTH parties within 60 days of approval, each to their own address. We never touch the claimant''s money.'),
    ('paid', 10, 'Reclaimed', 'Reconcile the receipt',
     array['admin','analyst']::text[], false, false, 'O.C.G.A. 44-12-220(c)(2)',
     'Match the DOR cheque against the expected amount. Payment is offset against unpaid Georgia tax first, so less than expected is not necessarily a discrepancy.'),
    ('closed_lost', 11, 'Reclaimed', 'Closed',
     array['admin','analyst']::text[], false, false, 'O.C.G.A. 44-12-220(g)',
     'Disappeared from the file (usually claimed by someone else), denied, or the claimant revoked. Revocation must be reported to DOR.')
  ) as t(stage, step_number, owner, action_label, required_roles,
         requires_designated_agent, requires_registration, statute, detail);
$$;

revoke all on function workflow_stage_rules() from public, anon;
grant execute on function workflow_stage_rules() to authenticated;
