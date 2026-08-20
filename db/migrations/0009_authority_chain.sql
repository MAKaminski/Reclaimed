-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Entities, evidence, and THE AUTHORITY CHAIN.
--
-- The most safety-critical subsystem. Every criminal prosecution in this
-- industry turned on forged authority: US v. Pendergrass & McQueen (N.D. Ga.,
-- 2017) ran eight shell "asset recovery" companies on FORGED POWER-OF-ATTORNEY
-- FORMS against local BUSINESSES — targeted because a dissolved entity has
-- nobody left to object. That is the exact segment this platform enters.
--
-- The design rule: NO LINK MAY BE ASSERTED WITHOUT AN UPLOADED EVIDENCE
-- DOCUMENT, and that is a NOT NULL constraint in the database, not a check in
-- application code that a future refactor can drop.
-- ═══════════════════════════════════════════════════════════════════════════

create type entity_status as enum (
  'active', 'admin_dissolved', 'terminated', 'merged', 'withdrawn', 'unchecked', 'unknown'
);

create table entities (
  id                uuid primary key default gen_random_uuid(),
  sos_control_number text unique,
  legal_name        text not null,
  status            entity_status not null default 'unchecked',
  status_as_of      date,
  entity_type       text,
  formation_date    date,
  dissolution_date  date,
  registered_agent_name    text,
  registered_agent_address text,
  principal_office_address text,
  merged_into_entity_id uuid references entities (id),
  officers          jsonb not null default '[]'::jsonb,
  source            text not null default 'ga_sos_bulk',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column entities.status is
  'Anything other than active sets requires_manual_review on the chain and blocks auto-progression. DOR publishes NOTHING on dissolved or merged entity requirements - docs/DOR-QUESTIONS.md #3.';

create index entities_name_idx on entities using gin (to_tsvector('simple', legal_name));

alter table entities enable row level security;
create policy entities_staff_read on entities
  for select to authenticated using (is_active_staff());
create policy entities_staff_write on entities
  for all to authenticated
  using (has_staff_role(array['admin','analyst']::staff_role[]))
  with check (has_staff_role(array['admin','analyst']::staff_role[]));

create type evidence_kind as enum (
  'sos_entity_record', 'sos_officer_record', 'corporate_resolution',
  'secretary_certificate', 'ein_letter_cp575', 'work_id_card',
  'authorization_letter', 'government_id', 'death_certificate',
  'will_or_codicil', 'probate_document', 'heir_affidavit',
  'merger_certificate', 'name_change_amendment', 'proof_of_payment',
  'signed_agreement', 'other'
);

create table evidence_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          evidence_kind not null,
  storage_path  text not null,
  sha256        text not null,
  byte_size     bigint not null check (byte_size > 0),
  mime_type     text,
  original_filename text,
  uploaded_by   uuid not null references staff (id),
  uploaded_at   timestamptz not null default now(),
  description   text,
  invalidated_at timestamptz,
  invalidated_by uuid references staff (id),
  invalidation_reason text
);

create unique index evidence_documents_sha_idx on evidence_documents (sha256);

comment on table evidence_documents is
  'Immutable evidence store. Documents are never deleted - invalidated_at marks one later found forged or superseded, because the trail of what we relied on and when IS the defence.';

alter table evidence_documents enable row level security;
create policy evidence_staff_read on evidence_documents
  for select to authenticated using (is_active_staff());
create policy evidence_staff_insert on evidence_documents
  for insert to authenticated
  with check (has_staff_role(array['admin','analyst']::staff_role[]) and uploaded_by = auth.uid());
create policy evidence_staff_invalidate on evidence_documents
  for update to authenticated
  using (has_staff_role(array['admin','reviewer']::staff_role[]))
  with check (has_staff_role(array['admin','reviewer']::staff_role[]));
create rule evidence_no_delete as on delete to evidence_documents do instead nothing;

create or replace function freeze_evidence_content()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.storage_path is distinct from old.storage_path
     or new.sha256 is distinct from old.sha256
     or new.byte_size is distinct from old.byte_size
     or new.kind is distinct from old.kind
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception
      'Evidence content is immutable. Upload a new document and invalidate this one instead.';
  end if;
  return new;
end;
$$;

create trigger evidence_immutable
  before update on evidence_documents
  for each row execute function freeze_evidence_content();

create type authority_link_type as enum (
  'owner_name_to_entity', 'entity_status', 'successor_entity',
  'authorized_signer', 'signer_identity', 'decedent_death',
  'heir_enumeration', 'individual_identity'
);

create type link_review_status as enum ('asserted', 'reviewed', 'rejected');

create table authority_links (
  id            uuid primary key default gen_random_uuid(),
  property_id   text not null,
  sequence      integer not null check (sequence >= 1),
  link_type     authority_link_type not null,
  from_ref      text,
  to_ref        text,
  entity_id     uuid references entities (id),

  -- NOT NULL. This is the whole design.
  evidence_document_id uuid not null references evidence_documents (id),

  confidence    numeric(4,3) not null check (confidence between 0 and 1),
  review_status link_review_status not null default 'asserted',

  asserted_by   uuid not null references staff (id),
  asserted_at   timestamptz not null default now(),
  reviewed_by   uuid references staff (id),
  reviewed_at   timestamptz,
  review_note   text,

  unique (property_id, sequence)
);

comment on column authority_links.evidence_document_id is
  'NOT NULL BY DESIGN. Every forged-POA prosecution in this industry involved authority asserted without documentation.';

comment on column authority_links.confidence is
  'Per-link. The CHAIN score is the MINIMUM of its links, never the mean - one weak link is a weak chain.';

create index authority_links_property_idx on authority_links (property_id, sequence);

alter table authority_links enable row level security;
create policy links_staff_read on authority_links
  for select to authenticated using (is_active_staff());
create policy links_staff_insert on authority_links
  for insert to authenticated
  with check (has_staff_role(array['admin','analyst']::staff_role[]) and asserted_by = auth.uid());
create policy links_reviewer_update on authority_links
  for update to authenticated
  using (has_staff_role(array['admin','reviewer']::staff_role[]))
  with check (has_staff_role(array['admin','reviewer']::staff_role[]));
create rule links_no_delete as on delete to authority_links do instead nothing;

create or replace function log_authority_link_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, detail, statute)
  values (
    auth.uid(), 'authority_link_' || lower(tg_op), 'authority_link',
    coalesce(new.property_id, old.property_id),
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)),
    'O.C.G.A. 44-12-224(b)'
  );
  return new;
end;
$$;

create trigger authority_links_audit
  after insert or update on authority_links
  for each row execute function log_authority_link_change();

revoke all on function log_authority_link_change() from public, anon, authenticated;
revoke all on function freeze_evidence_content() from public, anon, authenticated;
