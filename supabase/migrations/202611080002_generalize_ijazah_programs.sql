-- Safe upgrade for databases that installed the original Ghawthani-only
-- feature before course programs were introduced.

create extension if not exists pgcrypto;

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
) on conflict (slug) do update set
  title = excluded.title,
  course_subject = excluded.course_subject,
  instructor_name = excluded.instructor_name,
  introduction = excluded.introduction,
  trust_statement = excluded.trust_statement;

-- Link the default program to the existing Ghawthani course when that legacy
-- table is present. Dynamic SQL keeps the migration portable to fresh projects.
do $$
begin
  if to_regclass('public.shmoury_dawrat') is not null then
    execute $sql$
      update public.ijazah_programs
      set dawra_id = (
        select id
        from public.shmoury_dawrat
        where title ilike '%الغوثاني%'
           or coalesce(description, '') ilike '%الغوثاني%'
        order by created_at nulls last
        limit 1
      )
      where slug = 'ghawthani' and dawra_id is null
    $sql$;
  end if;
end;
$$;

alter table public.ghawthani_template_versions
  add column if not exists program_id uuid;
update public.ghawthani_template_versions
set program_id = (select id from public.ijazah_programs where slug = 'ghawthani')
where program_id is null;
alter table public.ghawthani_template_versions
  alter column program_id set not null,
  alter column storage_bucket set default 'ijazah-private';

alter table public.ghawthani_submissions
  add column if not exists program_id uuid;
update public.ghawthani_submissions
set program_id = (select id from public.ijazah_programs where slug = 'ghawthani')
where program_id is null;
alter table public.ghawthani_submissions
  alter column program_id set not null;

alter table public.ghawthani_issued_documents
  alter column storage_bucket set default 'ijazah-private';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ghawthani_template_versions_program_id_fkey') then
    alter table public.ghawthani_template_versions
      add constraint ghawthani_template_versions_program_id_fkey
      foreign key (program_id) references public.ijazah_programs(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ghawthani_submissions_program_id_fkey') then
    alter table public.ghawthani_submissions
      add constraint ghawthani_submissions_program_id_fkey
      foreign key (program_id) references public.ijazah_programs(id) on delete restrict;
  end if;
end;
$$;

drop index if exists public.uq_ghawthani_active_template;
create unique index uq_ghawthani_active_template
  on public.ghawthani_template_versions(program_id, template_type)
  where is_active;

drop index if exists public.idx_ghawthani_template_versions_type_created;
create index idx_ghawthani_template_versions_type_created
  on public.ghawthani_template_versions(program_id, template_type, created_at desc);

drop index if exists public.idx_ghawthani_submissions_submitted;
create index idx_ghawthani_submissions_submitted
  on public.ghawthani_submissions(program_id, submitted_at desc);

drop index if exists public.idx_ghawthani_submissions_filters;
create index idx_ghawthani_submissions_filters
  on public.ghawthani_submissions(program_id, gender, eligibility, generation_status, attendance_count);

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

drop trigger if exists ijazah_programs_touch on public.ijazah_programs;
create trigger ijazah_programs_touch
before update on public.ijazah_programs
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

  if target.id is null then raise exception 'Template version not found'; end if;
  if not target.is_validated then raise exception 'Template must be validated before activation'; end if;

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

alter table public.ijazah_programs enable row level security;
revoke all on table public.ijazah_programs from anon, authenticated;
grant all on table public.ijazah_programs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ijazah-private', 'ijazah-private', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

