import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0';
import { personalizePdf, readBundledArabicFont, type NamePlacement } from './pdf.ts';
import { sha256Hex } from './crypto.ts';
import { expectedDocumentTypes, type DocumentType } from './eligibility.ts';
const BUCKET = 'ijazah-private';

function placementFromTemplate(template: Record<string, unknown>): NamePlacement {
  return {
    page_index: Number(template.page_index),
    page_width: Number(template.page_width),
    page_height: Number(template.page_height),
    name_x: Number(template.name_x),
    name_y: Number(template.name_y),
    name_width: Number(template.name_width),
    name_height: Number(template.name_height),
    font_size: Number(template.font_size),
    min_font_size: Number(template.min_font_size),
    font_color: String(template.font_color),
    alignment: template.alignment as NamePlacement['alignment'],
  };
}

export async function issueSubmissionDocuments(client: SupabaseClient, submission: Record<string, any>) {
  const requiredTypes = expectedDocumentTypes(submission as any);
  if (requiredTypes.length === 0) {
    const { error } = await client.from('ghawthani_submissions').update({
      generation_status: 'not_required',
      generation_error: null,
      generation_completed_at: new Date().toISOString(),
    }).eq('id', submission.id);
    if (error) throw error;
    return [];
  }

  await client.from('ghawthani_submissions').update({
    generation_status: 'processing',
    generation_error: null,
    generation_started_at: new Date().toISOString(),
    generation_completed_at: null,
  }).eq('id', submission.id);

  try {
    const { data: existing, error: existingError } = await client
      .from('ghawthani_issued_documents')
      .select('*')
      .eq('submission_id', submission.id);
    if (existingError) throw existingError;
    const completedTypes = new Set((existing || []).filter((row) => row.generation_status === 'issued').map((row) => row.document_type));
    const pendingTypes = requiredTypes.filter((type) => !completedTypes.has(type));

    if (pendingTypes.length > 0) {
      const { data: templates, error: templateError } = await client
        .from('ghawthani_template_versions')
        .select('*')
        .eq('program_id', submission.program_id)
        .in('template_type', pendingTypes)
        .eq('is_active', true)
        .eq('is_validated', true);
      if (templateError) throw templateError;
      const byType = new Map((templates || []).map((template) => [template.template_type, template]));
      const missing = pendingTypes.filter((type) => !byType.has(type));
      if (missing.length) throw new Error(`القالب المطلوب غير متوفر أو غير مفعّل: ${missing.join(', ')}`);

      const fontBytes = await readBundledArabicFont();
      for (const documentType of pendingTypes) {
        const template = byType.get(documentType)!;
        const storagePath = `issued/${submission.program_id}/${submission.id}/${documentType}.pdf`;
        const { data: issueRow, error: upsertError } = await client
          .from('ghawthani_issued_documents')
          .upsert({
            submission_id: submission.id,
            document_type: documentType,
            template_version_id: template.id,
            generation_status: 'processing',
            storage_bucket: BUCKET,
            storage_path: storagePath,
            generation_error: null,
          }, { onConflict: 'submission_id,document_type' })
          .select('*')
          .single();
        if (upsertError) throw upsertError;

        try {
          const { data: templateBlob, error: downloadError } = await client.storage
            .from(template.storage_bucket)
            .download(template.storage_path);
          if (downloadError || !templateBlob) throw downloadError || new Error('تعذر تنزيل القالب.');
          const output = await personalizePdf(
            new Uint8Array(await templateBlob.arrayBuffer()),
            fontBytes,
            submission.full_name,
            placementFromTemplate(template),
          );
          const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, output, {
            contentType: 'application/pdf',
            cacheControl: '0',
            upsert: true,
          });
          if (uploadError) throw uploadError;
          const { error: issuedError } = await client.from('ghawthani_issued_documents').update({
            generation_status: 'issued',
            file_sha256: await sha256Hex(output),
            generation_error: null,
            issued_at: issueRow.issued_at || new Date().toISOString(),
          }).eq('id', issueRow.id);
          if (issuedError) throw issuedError;
        } catch (error) {
          await client.from('ghawthani_issued_documents').update({
            generation_status: 'failed',
            generation_error: error instanceof Error ? error.message : 'فشل توليد المستند.',
          }).eq('id', issueRow.id);
          throw error;
        }
      }
    }

    const { data: issuedRows, error: finalError } = await client
      .from('ghawthani_issued_documents')
      .select('*')
      .eq('submission_id', submission.id)
      .in('document_type', requiredTypes);
    if (finalError) throw finalError;
    if (issuedRows?.length !== requiredTypes.length || issuedRows.some((row) => row.generation_status !== 'issued')) {
      throw new Error('لم يكتمل توليد جميع المستندات المطلوبة.');
    }
    const { error: completeError } = await client.from('ghawthani_submissions').update({
      generation_status: 'completed',
      generation_error: null,
      generation_completed_at: new Date().toISOString(),
    }).eq('id', submission.id);
    if (completeError) throw completeError;
    return issuedRows;
  } catch (error) {
    await client.from('ghawthani_submissions').update({
      generation_status: 'failed',
      generation_error: error instanceof Error ? error.message : 'فشل توليد المستندات.',
      generation_completed_at: null,
    }).eq('id', submission.id);
    throw error;
  }
}

export async function signedDocuments(client: SupabaseClient, submissionId: string, expiresIn = 300) {
  const { data, error } = await client
    .from('ghawthani_issued_documents')
    .select('id, document_type, generation_status, storage_bucket, storage_path, issued_at, template_version_id')
    .eq('submission_id', submissionId)
    .eq('generation_status', 'issued')
    .order('document_type');
  if (error) throw error;
  return await Promise.all((data || []).map(async (document) => {
    const { data: signed, error: signedError } = await client.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, expiresIn, { download: true });
    if (signedError) throw signedError;
    return { ...document, download_url: signed.signedUrl, expires_in: expiresIn };
  }));
}
