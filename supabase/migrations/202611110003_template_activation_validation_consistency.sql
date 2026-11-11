-- Repair rows affected by the old sample-generation flow. Every active
-- template had to be validated before activation, so these rows can be
-- restored safely: generating a later sample did not change the PDF or its
-- placement configuration.
update public.ghawthani_template_versions
set is_validated = true,
    validated_at = coalesce(validated_at, sample_generated_at, activated_at, now())
where is_active
  and not is_validated;

alter table public.ghawthani_template_versions
  drop constraint if exists ghawthani_template_versions_active_validated_check;

alter table public.ghawthani_template_versions
  add constraint ghawthani_template_versions_active_validated_check
  check (not is_active or is_validated);
