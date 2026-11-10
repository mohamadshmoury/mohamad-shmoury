-- Adds a per-template Arabic font choice. Template and submission deletion are
-- performed by the authenticated admin Edge Function so private storage files
-- can be cleaned up together with their database rows.

alter table public.ghawthani_template_versions
  add column if not exists font_family text not null default 'noto_naskh';

alter table public.ghawthani_template_versions
  drop constraint if exists ghawthani_template_versions_font_family_check;

alter table public.ghawthani_template_versions
  add constraint ghawthani_template_versions_font_family_check
  check (font_family in ('noto_naskh', 'amiri', 'aref_ruqaa'));

comment on column public.ghawthani_template_versions.font_family is
'Bundled Arabic font used to render participant names into this PDF template version.';
