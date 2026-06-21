create extension if not exists pgcrypto;

create table if not exists public.shmoury_dawrat (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  sheikh_intro text,
  starts_on date,
  status text not null default 'in_progress' check (status in ('draft', 'in_progress', 'completed', 'archived')),
  theme_color text default '#0f766e',
  duration text,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shmoury_exams (
  id uuid primary key default gen_random_uuid(),
  dawra_id uuid not null references public.shmoury_dawrat(id) on delete cascade,
  title text not null,
  description text,
  access_code text,
  passing_score int not null default 70 check (passing_score between 1 and 100),
  allow_multiple_attempts boolean not null default false,
  is_published boolean not null default false,
  show_results_immediately boolean not null default true,
  ends_at timestamptz,
  show_answers_after_end boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shmoury_profile (
  id int primary key default 1 check (id = 1),
  bio text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.shmoury_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.shmoury_exams(id) on delete cascade,
  prompt text not null,
  type text not null check (type in ('multiple_choice', 'true_false', 'short_answer')),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null default '{}'::jsonb,
  points int not null default 1 check (points > 0),
  sort_order int not null default 0,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.shmoury_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.shmoury_exams(id) on delete cascade,
  student_name text not null,
  phone text not null,
  email text,
  score numeric not null default 0,
  percentage numeric not null default 0,
  status text not null check (status in ('passed', 'failed')),
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  duration_seconds int not null default 0,
  reviewed boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_shmoury_exams_dawra on public.shmoury_exams(dawra_id);
create index if not exists idx_shmoury_questions_exam on public.shmoury_questions(exam_id, sort_order);
create index if not exists idx_shmoury_submissions_exam on public.shmoury_submissions(exam_id, submitted_at desc);
create index if not exists idx_shmoury_submissions_phone on public.shmoury_submissions(exam_id, phone);
create index if not exists idx_shmoury_submissions_email on public.shmoury_submissions(exam_id, email);

alter table public.shmoury_dawrat enable row level security;
alter table public.shmoury_exams enable row level security;
alter table public.shmoury_questions enable row level security;
alter table public.shmoury_submissions enable row level security;
alter table public.shmoury_profile enable row level security;

drop policy if exists "Public read dawrat" on public.shmoury_dawrat;
create policy "Public read dawrat"
on public.shmoury_dawrat
for select
to anon
using (true);

drop policy if exists "Public read exams" on public.shmoury_exams;
create policy "Public read exams"
on public.shmoury_exams
for select
to anon
using (true);

drop policy if exists "Public read questions" on public.shmoury_questions;
create policy "Public read questions"
on public.shmoury_questions
for select
to anon
using (true);

drop policy if exists "Public insert submissions" on public.shmoury_submissions;
create policy "Public insert submissions"
on public.shmoury_submissions
for insert
to anon
with check (true);

drop policy if exists "Public read profile" on public.shmoury_profile;
create policy "Public read profile"
on public.shmoury_profile
for select
to anon
using (true);

drop policy if exists "Simple admin read submissions" on public.shmoury_submissions;
create policy "Simple admin read submissions"
on public.shmoury_submissions
for select
to anon
using (true);

drop policy if exists "Simple admin update submissions" on public.shmoury_submissions;
create policy "Simple admin update submissions"
on public.shmoury_submissions
for update
to anon
using (true)
with check (true);

drop policy if exists "Simple admin manage dawrat" on public.shmoury_dawrat;
create policy "Simple admin manage dawrat"
on public.shmoury_dawrat
for all
to anon
using (true)
with check (true);

drop policy if exists "Simple admin manage exams" on public.shmoury_exams;
create policy "Simple admin manage exams"
on public.shmoury_exams
for all
to anon
using (true)
with check (true);

drop policy if exists "Simple admin manage questions" on public.shmoury_questions;
create policy "Simple admin manage questions"
on public.shmoury_questions
for all
to anon
using (true)
with check (true);

drop policy if exists "Admin manage profile" on public.shmoury_profile;
create policy "Admin manage profile"
on public.shmoury_profile
for all
to anon
using (true)
with check (true);

insert into public.shmoury_profile (id, bio, avatar_url)
values (1, 'مرحباً بكم في المنصة الرسمية لدروس ودورات الشيخ محمد أحمد الشموري.', null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shmoury-assets', 'shmoury-assets', true, 52428800, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read shmoury assets" on storage.objects;
create policy "Public read shmoury assets"
on storage.objects
for select
to anon
using (bucket_id = 'shmoury-assets');

drop policy if exists "Simple admin upload shmoury assets" on storage.objects;
create policy "Simple admin upload shmoury assets"
on storage.objects
for insert
to anon
with check (bucket_id = 'shmoury-assets');

drop policy if exists "Simple admin update shmoury assets" on storage.objects;
create policy "Simple admin update shmoury assets"
on storage.objects
for update
to anon
using (bucket_id = 'shmoury-assets')
with check (bucket_id = 'shmoury-assets');

drop policy if exists "Simple admin delete shmoury assets" on storage.objects;
create policy "Simple admin delete shmoury assets"
on storage.objects
for delete
to anon
using (bucket_id = 'shmoury-assets');

comment on table public.shmoury_dawrat is
'Simple client-side admin mode: policies are permissive so the predefined code can manage content from the browser. Replace with Supabase Auth before public production use.';
