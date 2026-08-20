-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Allow the bootstrap invite.
--
-- staff_invites.invited_by was NOT NULL referencing staff(id), which made the
-- FIRST admin impossible to create: on a fresh database there is no staff row to
-- attribute the invitation to, so the bootstrap CLI — whose entire purpose is
-- exactly that case — would have failed on a foreign key violation.
--
-- invited_by is now nullable, and NULL has a specific meaning: created by the
-- bootstrap CLI before any administrator existed. More honest than attributing
-- it to a placeholder row, and it stays visible in the audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

alter table staff_invites alter column invited_by drop not null;

comment on column staff_invites.invited_by is
  'NULL means the bootstrap CLI created this invite before any administrator existed. Every other invite is attributed to the admin whose session inserted it - the RLS policy requires an admin session, so a non-null value cannot be forged by a non-admin.';

-- Exactly one bootstrap invite may ever exist. Without this, a second
-- unattributed invite could be introduced later and read as legitimate.
create unique index staff_invites_single_bootstrap
  on staff_invites ((invited_by is null))
  where invited_by is null;
