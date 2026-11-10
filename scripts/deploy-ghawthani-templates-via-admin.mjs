import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const adminCode = process.env.VITE_ADMIN_ACCESS_CODE;
if (!url || !anonKey || !adminCode) throw new Error('Supabase URL, anon key, and admin code are required.');

const programId = '9b6ecacd-fb7b-4c03-aee5-71a2ec4f5210';
const allDefinitions = [
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
const requestedType = process.argv[2];
const definitions = requestedType ? allDefinitions.filter((definition) => definition.type === requestedType) : allDefinitions;
if (!definitions.length) throw new Error(`Unknown template type: ${requestedType}`);

const client = createClient(url, anonKey, { auth: { persistSession: false } });
const login = await client.functions.invoke('ghawthani-admin', { body: { action: 'login', code: adminCode } });
if (login.error) throw login.error;
const headers = { 'x-ghawthani-admin': login.data.token };
const outputDir = resolve('tmp/pdfs/live-templates');
await mkdir(outputDir, { recursive: true });

for (const definition of definitions) {
  const bytes = await readFile(resolve(definition.file));
  const upload = await client.functions.invoke('ghawthani-admin', {
    body: {
      action: 'upload_template',
      program_id: programId,
      template_type: definition.type,
      filename: basename(definition.file),
      file_base64: bytes.toString('base64'),
      ...definition.placement,
    },
    headers,
  });
  if (upload.error) throw upload.error;
  const template = upload.data.template;

  const sample = await client.functions.invoke('ghawthani-admin', {
    body: { action: 'generate_sample', template_id: template.id, sample_name: 'محمد أحمد عبد الله' },
    headers,
  });
  if (sample.error) throw sample.error;
  const response = await fetch(sample.data.sample_url);
  if (!response.ok) throw new Error(`Could not download ${definition.type} sample: ${response.status}`);
  const samplePath = resolve(outputDir, `${definition.type}.pdf`);
  await writeFile(samplePath, new Uint8Array(await response.arrayBuffer()));

  const validation = await client.functions.invoke('ghawthani-admin', {
    body: { action: 'validate_template', template_id: template.id },
    headers,
  });
  if (validation.error) throw validation.error;
  const activation = await client.functions.invoke('ghawthani-admin', {
    body: { action: 'activate_template', template_id: template.id },
    headers,
  });
  if (activation.error) throw activation.error;
  console.log(JSON.stringify({ type: definition.type, version: activation.data.template.version_number, samplePath }));
}
