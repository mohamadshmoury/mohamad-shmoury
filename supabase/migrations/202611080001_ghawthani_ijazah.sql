-- Reusable Ijazah and participation-certificate feature. The Ghawthani
-- course is seeded as the first program while templates and submissions are
-- isolated per program.
-- All participant and document access goes through Edge Functions using the
-- service role. No direct anon/authenticated table or storage access is granted.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.ijazah_programs (
  id uuid primary key default gen_random_uuid(),
  dawra_id uuid,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  course_subject text not null check (char_length(btrim(course_subject)) between 3 and 300),
  instructor_name text not null check (char_length(btrim(instructor_name)) between 3 and 160),
  introduction text not null default '',
  trust_statement text not null default 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ijazah_programs (
  id, slug, title, course_subject, instructor_name, introduction, trust_statement
) values (
  '9b6ecacd-fb7b-4c03-aee5-71a2ec4f5210',
  'ghawthani',
  'إجازة وشهادة دورة الغوثاني',
  'قراءة وشرح كتاب «كيف تحفظ القرآن الكريم»',
  'الشيخ د. يحيى الغوثاني',
  'هذه الاستمارة خاصة بدورة قراءة وشرح كتاب «كيف تحفظ القرآن الكريم» للشيخ د. يحيى الغوثاني.',
  'تُعتمد إجابات الحضور على الأمانة العلمية والثقة في النقل عند أهل القرآن والعلم.'
) on conflict (slug) do nothing;

create table if not exists public.ghawthani_template_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.ijazah_programs(id) on delete cascade,
  version_number bigint generated always as identity,
  template_type text not null check (template_type in ('ijazah_male', 'ijazah_female', 'participation_certificate')),
  original_filename text not null,
  storage_bucket text not null default 'ijazah-private',
  storage_path text not null unique,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer not null check (page_count > 0),
  page_index integer not null default 0 check (page_index >= 0),
  page_width numeric not null check (page_width > 0),
  page_height numeric not null check (page_height > 0),
  name_x numeric not null check (name_x >= 0),
  name_y numeric not null check (name_y >= 0),
  name_width numeric not null check (name_width > 0),
  name_height numeric not null check (name_height > 0),
  font_size numeric not null check (font_size between 8 and 72),
  min_font_size numeric not null check (min_font_size between 8 and font_size),
  font_color text not null default '#171717' check (font_color ~ '^#[0-9A-Fa-f]{6}$'),
  alignment text not null default 'center' check (alignment in ('center', 'right', 'left')),
  sample_storage_path text,
  sample_generated_at timestamptz,
  is_validated boolean not null default false,
  validated_at timestamptz,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null default 'admin',
  constraint ghawthani_template_bounds check (
    page_index < page_count
    and name_x + name_width <= page_width + 0.5
    and name_y + name_height <= page_height + 0.5
  )
);

create unique index if not exists uq_ghawthani_active_template
  on public.ghawthani_template_versions(program_id, template_type)
  where is_active;
create index if not exists idx_ghawthani_template_versions_type_created
  on public.ghawthani_template_versions(program_id, template_type, created_at desc);

create table if not exists public.ghawthani_submissions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.ijazah_programs(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 160),
  gender text not null check (gender in ('male', 'female')),
  attended_day_1 boolean not null,
  attended_day_2 boolean not null,
  attended_day_3 boolean not null,
  attendance_count smallint generated always as (
    attended_day_1::integer + attended_day_2::integer + attended_day_3::integer
  ) stored,
  eligibility text generated always as (
    case
      when attended_day_1 and attended_day_2 and attended_day_3 then 'ijazah_and_certificate'
      when attended_day_1 or attended_day_2 or attended_day_3 then 'certificate_only'
      else 'none'
    end
  ) stored,
  acknowledged boolean not null check (acknowledged),
  idempotency_key_hash text not null unique check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  generation_status text not null default 'pending'
    check (generation_status in ('pending', 'processing', 'completed', 'failed', 'not_required')),
  generation_error text,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ghawthani_submissions_submitted
  on public.ghawthani_submissions(program_id, submitted_at desc);
create index if not exists idx_ghawthani_submissions_name
  on public.ghawthani_submissions using gin (full_name gin_trgm_ops);
create index if not exists idx_ghawthani_submissions_filters
  on public.ghawthani_submissions(program_id, gender, eligibility, generation_status, attendance_count);

create table if not exists public.ghawthani_issued_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ghawthani_submissions(id) on delete cascade,
  document_type text not null check (document_type in ('ijazah_male', 'ijazah_female', 'participation_certificate')),
  template_version_id uuid not null references public.ghawthani_template_versions(id) on delete restrict,
  generation_status text not null default 'processing' check (generation_status in ('processing', 'issued', 'failed')),
  storage_bucket text not null default 'ijazah-private',
  storage_path text not null,
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  generation_error text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, document_type),
  unique (storage_bucket, storage_path)
);

create index if not exists idx_ghawthani_documents_submission
  on public.ghawthani_issued_documents(submission_id, document_type);
create index if not exists idx_ghawthani_documents_template
  on public.ghawthani_issued_documents(template_version_id);

create or replace function public.ghawthani_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ghawthani_submissions_touch on public.ghawthani_submissions;
create trigger ghawthani_submissions_touch
before update on public.ghawthani_submissions
for each row execute function public.ghawthani_touch_updated_at();

drop trigger if exists ijazah_programs_touch on public.ijazah_programs;
create trigger ijazah_programs_touch
before update on public.ijazah_programs
for each row execute function public.ghawthani_touch_updated_at();

drop trigger if exists ghawthani_documents_touch on public.ghawthani_issued_documents;
create trigger ghawthani_documents_touch
before update on public.ghawthani_issued_documents
for each row execute function public.ghawthani_touch_updated_at();

create or replace function public.ghawthani_activate_template(target_id uuid)
returns public.ghawthani_template_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.ghawthani_template_versions;
begin
  select * into target
  from public.ghawthani_template_versions
  where id = target_id
  for update;

  if target.id is null then
    raise exception 'Template version not found';
  end if;
  if not target.is_validated then
    raise exception 'Template must be validated before activation';
  end if;

  update public.ghawthani_template_versions
  set is_active = false, activated_at = null
  where program_id = target.program_id
    and template_type = target.template_type
    and id <> target.id
    and is_active;

  update public.ghawthani_template_versions
  set is_active = true, activated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.ghawthani_activate_template(uuid) from public, anon, authenticated;
grant execute on function public.ghawthani_activate_template(uuid) to service_role;

alter table public.ghawthani_template_versions enable row level security;
alter table public.ghawthani_submissions enable row level security;
alter table public.ghawthani_issued_documents enable row level security;
alter table public.ijazah_programs enable row level security;

revoke all on table public.ghawthani_template_versions from anon, authenticated;
revoke all on table public.ghawthani_submissions from anon, authenticated;
revoke all on table public.ghawthani_issued_documents from anon, authenticated;
revoke all on table public.ijazah_programs from anon, authenticated;
grant all on table public.ghawthani_template_versions to service_role;
grant all on table public.ghawthani_submissions to service_role;
grant all on table public.ghawthani_issued_documents to service_role;
grant all on table public.ijazah_programs to service_role;
revoke all on sequence public.ghawthani_template_versions_version_number_seq from anon, authenticated;
grant usage, select on sequence public.ghawthani_template_versions_version_number_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ijazah-private', 'ijazah-private', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Intentionally no storage.objects policies: the Edge Functions use the service
-- role and return short-lived signed URLs after checking a participant/admin token.
drop policy if exists "Public read ghawthani documents" on storage.objects;
drop policy if exists "Public upload ghawthani documents" on storage.objects;
drop policy if exists "Public update ghawthani documents" on storage.objects;
drop policy if exists "Public delete ghawthani documents" on storage.objects;

comment on table public.ijazah_programs is
'Course-level configuration for the reusable Ijazah and certificate workflow.';
comment on table public.ghawthani_submissions is
'Private course attendance declarations, scoped by program. Eligibility is generated by PostgreSQL from the three attendance booleans.';
comment on table public.ghawthani_issued_documents is
'Idempotent document issuance records, unique per submission and document type, retaining the exact template version used.';
