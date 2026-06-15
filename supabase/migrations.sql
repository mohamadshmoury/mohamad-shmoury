-- 1. Create shmoury_profile table
create table if not exists public.shmoury_profile (
  id int primary key default 1 check (id = 1),
  bio text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- 2. RLS policies for shmoury_profile
alter table public.shmoury_profile enable row level security;

drop policy if exists "Public read profile" on public.shmoury_profile;
create policy "Public read profile"
on public.shmoury_profile
for select
to anon
using (true);

drop policy if exists "Admin manage profile" on public.shmoury_profile;
create policy "Admin manage profile"
on public.shmoury_profile
for all
to anon
using (true)
with check (true);

-- 3. Insert default profile row if it does not exist
insert into public.shmoury_profile (id, bio, avatar_url)
values (1, 'مرحباً بكم في المنصة الرسمية لدروس ودورات الشيخ محمد أحمد الشموري.', null)
on conflict (id) do nothing;

-- 4. Add duration and attachments to shmoury_dawrat
alter table public.shmoury_dawrat add column if not exists duration text;
alter table public.shmoury_dawrat add column if not exists attachments jsonb default '[]'::jsonb;

-- 4b. Expand course lifecycle states:
-- draft = visible as upcoming, in_progress = visible with exams, completed = visible with materials.
alter table public.shmoury_dawrat drop constraint if exists shmoury_dawrat_status_check;
update public.shmoury_dawrat
set status = 'in_progress'
where status = 'active';
alter table public.shmoury_dawrat alter column status set default 'in_progress';
alter table public.shmoury_dawrat
  add constraint shmoury_dawrat_status_check
  check (status in ('draft', 'in_progress', 'completed', 'archived'));

-- 5. Add show_results_immediately to shmoury_exams
alter table public.shmoury_exams add column if not exists show_results_immediately boolean not null default true;

-- 6. Public storage bucket for course files and sheikh profile images
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
