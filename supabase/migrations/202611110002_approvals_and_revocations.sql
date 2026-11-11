-- Adds course approval workflow and explicit document revocation support
-- as an additive, idempotent migration on top of 202611110001.

alter table public.ijazah_programs
  add column if not exists requires_approval boolean not null default false;

comment on column public.ijazah_programs.requires_approval is
'When true, new participant requests enter pending_approval until an administrator approves them for issuance. Defaults to false to preserve immediate issuance for existing programs.';

alter table public.ghawthani_submissions
  add column if not exists certificate_eligible boolean,
  add column if not exists ijazah_eligible boolean,
  add column if not exists eligibility_source text not null default 'legacy_attendance',
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

update public.ghawthani_submissions
set certificate_eligible = coalesce(certificate_eligible, attendance_count > 0),
    ijazah_eligible = coalesce(ijazah_eligible, attendance_count = 3)
where certificate_eligible is null or ijazah_eligible is null;

alter table public.ghawthani_submissions
  drop constraint if exists ghawthani_submissions_eligibility_source_check,
  drop constraint if exists ghawthani_submissions_approval_status_check;

alter table public.ghawthani_submissions
  add constraint ghawthani_submissions_eligibility_source_check
    check (eligibility_source in ('legacy_attendance', 'passed_exam', 'manual')),
  add constraint ghawthani_submissions_approval_status_check
    check (approval_status in ('pending_approval', 'approved', 'rejected'));

