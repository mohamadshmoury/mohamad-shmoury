-- Extends the existing course-scoped Ijazah workflow without replacing any
-- legacy Ghawthani records, access tokens, template versions, or issued PDFs.

alter table public.ijazah_programs
  add column if not exists offers_certificate boolean not null default true,
  add column if not exists offers_ijazah boolean not null default true,
  add column if not exists eligibility_method text not null default 'legacy_attendance',
  add column if not exists requires_approval boolean not null default false,
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz;

alter table public.ijazah_programs
  drop constraint if exists ijazah_programs_offers_check,
  drop constraint if exists ijazah_programs_eligibility_method_check,
  drop constraint if exists ijazah_programs_availability_check;

alter table public.ijazah_programs
  add constraint ijazah_programs_offers_check
    check (offers_certificate or offers_ijazah),
  add constraint ijazah_programs_eligibility_method_check
    check (eligibility_method in ('legacy_attendance', 'passed_exam', 'manual')),
  add constraint ijazah_programs_availability_check
    check (available_until is null or available_from is null or available_until > available_from);

comment on column public.ijazah_programs.offers_certificate is
'Whether this course can issue participation certificates.';
comment on column public.ijazah_programs.offers_ijazah is
'Whether this course can issue gender-specific Ijazah documents.';
comment on column public.ijazah_programs.eligibility_method is
'legacy_attendance preserves the Ghawthani declaration; passed_exam grants access after a passed linked-course exam; manual is administrator-granted.';
comment on column public.ijazah_programs.requires_approval is
'When true, new participant requests enter pending_approval until an administrator approves them for issuance. Defaults to false to preserve immediate issuance for existing programs.';
comment on column public.ijazah_programs.available_from is
'Optional inclusive start time for new requests and first issuance.';
comment on column public.ijazah_programs.available_until is
'Optional exclusive end time for new requests and issuance. Previously issued documents remain recorded and downloadable.';

create table if not exists public.ijazah_entitlements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.ijazah_programs(id) on delete cascade,
  source_type text not null check (source_type in ('exam_submission', 'manual')),
  source_id uuid,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 160),
  gender text check (gender is null or gender in ('male', 'female')),
  certificate_eligible boolean not null default false,
  ijazah_eligible boolean not null default false,
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ijazah_entitlements_document_check check (certificate_eligible or ijazah_eligible)
);

create unique index if not exists uq_ijazah_entitlements_source
  on public.ijazah_entitlements(program_id, source_type, source_id)
  where source_id is not null;
create unique index if not exists uq_ijazah_entitlements_access_hash
  on public.ijazah_entitlements(access_token_hash);
create index if not exists idx_ijazah_entitlements_program_created
  on public.ijazah_entitlements(program_id, created_at desc);

drop trigger if exists ijazah_entitlements_touch on public.ijazah_entitlements;
create trigger ijazah_entitlements_touch
before update on public.ijazah_entitlements
for each row execute function public.ghawthani_touch_updated_at();

alter table public.ghawthani_submissions
  add column if not exists entitlement_id uuid references public.ijazah_entitlements(id) on delete restrict,
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

create unique index if not exists uq_ghawthani_submissions_entitlement
  on public.ghawthani_submissions(entitlement_id)
  where entitlement_id is not null;

alter table public.ijazah_entitlements enable row level security;
revoke all on table public.ijazah_entitlements from public, anon, authenticated;
grant all on table public.ijazah_entitlements to service_role;

comment on table public.ijazah_entitlements is
'Private per-participant course document eligibility. Access is only through Edge Functions using opaque participant tokens.';
comment on column public.ghawthani_submissions.entitlement_id is
'Links a generic course entitlement to the existing issuance request pipeline. Legacy Ghawthani requests remain null.';
