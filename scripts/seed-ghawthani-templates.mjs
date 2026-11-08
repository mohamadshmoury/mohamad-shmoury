import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

const ROOT = resolve(import.meta.dirname, '..');
const BUCKET = 'ijazah-private';
const definitions = [
  {
    type: 'ijazah_male',
    file: 'supabase/seed-assets/ghawthani/ijazah-male.pdf',
    placement: { page_index: 0, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11, font_color: '#171717', alignment: 'center' },
  },
  {
    type: 'ijazah_female',
    file: 'supabase/seed-assets/ghawthani/ijazah-female.pdf',
    placement: { page_index: 0, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11, font_color: '#171717', alignment: 'center' },
  },
  {
    type: 'participation_certificate',
    file: 'supabase/seed-assets/ghawthani/participation-certificate.pdf',
    placement: { page_index: 0, name_x: 145, name_y: 382, name_width: 552, name_height: 50, font_size: 28, min_font_size: 14, font_color: '#171717', alignment: 'center' },
  },
];

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before seeding.');
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: program, error: programError } = await client.from('ijazah_programs')
    .select('id').eq('slug', 'ghawthani').single();
  if (programError) throw programError;

  for (const definition of definitions) {
    const bytes = await readFile(resolve(ROOT, definition.file));
    const hash = createHash('sha256').update(bytes).digest('hex');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = pdf.getPages();
    const page = pages[definition.placement.page_index];
    const { width, height } = page.getSize();
    const { data: existing, error: existingError } = await client
      .from('ghawthani_template_versions')
      .select('*')
      .eq('program_id', program.id)
      .eq('template_type', definition.type)
      .eq('file_sha256', hash)
      .maybeSingle();
    if (existingError) throw existingError;

    let template = existing;
    if (!template) {
      const id = crypto.randomUUID();
      const storagePath = `templates/${program.id}/${definition.type}/${id}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: 'application/pdf', cacheControl: '0', upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await client.from('ghawthani_template_versions').insert({
        program_id: program.id,
        template_type: definition.type,
        original_filename: basename(definition.file),
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_sha256: hash,
        page_count: pages.length,
        page_width: width,
        page_height: height,
        ...definition.placement,
        is_validated: true,
        validated_at: new Date().toISOString(),
      }).select('*').single();
      if (insertError) {
        await client.storage.from(BUCKET).remove([storagePath]);
        throw insertError;
      }
      template = inserted;
    } else if (!template.is_validated) {
      const { data: validated, error: validateError } = await client.from('ghawthani_template_versions')
        .update({ is_validated: true, validated_at: new Date().toISOString() })
        .eq('id', template.id).select('*').single();
      if (validateError) throw validateError;
      template = validated;
    }

    const { error: activationError } = await client.rpc('ghawthani_activate_template', { target_id: template.id });
    if (activationError) throw activationError;
    console.log(`Activated ${definition.type} template version ${template.version_number}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
