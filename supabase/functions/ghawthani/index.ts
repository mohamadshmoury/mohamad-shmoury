import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createParticipantToken, sha256Hex } from '../_shared/crypto.ts';
import { issueSubmissionDocuments, signedDocuments } from '../_shared/issuance.ts';
import { cleanParticipantName } from '../_shared/pdf.ts';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('إعدادات Supabase الخادمية غير مكتملة.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requireBoolean(body: Record<string, unknown>, key: string) {
  if (typeof body[key] !== 'boolean') throw new Error('يجب الإجابة صراحةً عن جميع أسئلة الحضور.');
  return body[key] as boolean;
}

function safeSubmission(row: Record<string, any>) {
  return {
    id: row.id,
    program_id: row.program_id,
    full_name: row.full_name,
    gender: row.gender,
    attended_day_1: row.attended_day_1,
    attended_day_2: row.attended_day_2,
    attended_day_3: row.attended_day_3,
    attendance_count: row.attendance_count,
    eligibility: row.eligibility,
    generation_status: row.generation_status,
    generation_error: row.generation_error,
    submitted_at: row.submitted_at,
  };
}

async function findAuthorizedSubmission(client: ReturnType<typeof serviceClient>, id: unknown, token: unknown) {
  if (typeof id !== 'string' || typeof token !== 'string') throw new Error('بيانات الوصول إلى الطلب غير مكتملة.');
  const accessHash = await sha256Hex(token);
  const { data, error } = await client
    .from('ghawthani_submissions')
    .select('*')
    .eq('id', id)
    .eq('access_token_hash', accessHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('تعذر التحقق من صلاحية الوصول إلى هذا الطلب.');
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('الطريقة غير مدعومة.'), 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'submit';
    const client = serviceClient();

    if (action === 'program') {
      const slug = typeof body.program_slug === 'string' ? body.program_slug.trim().toLowerCase() : 'ghawthani';
      const { data, error } = await client.from('ijazah_programs')
        .select('id, slug, title, course_subject, instructor_name, introduction, trust_statement')
        .eq('slug', slug).eq('is_active', true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('برنامج الإجازات والشهادات المطلوب غير متاح.');
      return jsonResponse({ program: data });
    }

    if (action === 'status') {
      const submission = await findAuthorizedSubmission(client, body.submission_id, body.access_token);
      return jsonResponse({
        submission: safeSubmission(submission),
        documents: await signedDocuments(client, submission.id),
      });
    }

    if (action !== 'submit') throw new Error('الإجراء غير مدعوم.');

    const programSlug = typeof body.program_slug === 'string' ? body.program_slug.trim().toLowerCase() : 'ghawthani';
    const { data: program, error: programError } = await client.from('ijazah_programs')
      .select('id, slug').eq('slug', programSlug).eq('is_active', true).maybeSingle();
    if (programError) throw programError;
    if (!program) throw new Error('برنامج الإجازات والشهادات المطلوب غير متاح.');

    const fullName = cleanParticipantName(body.full_name);
    const gender = body.gender === 'male' || body.gender === 'female' ? body.gender : null;
    if (!gender) throw new Error('يرجى اختيار الجنس.');
    const day1 = requireBoolean(body, 'attended_day_1');
    const day2 = requireBoolean(body, 'attended_day_2');
    const day3 = requireBoolean(body, 'attended_day_3');
    if (body.acknowledged !== true) throw new Error('يجب تأكيد صحة المعلومات والاسم قبل الإرسال.');
    if (typeof body.idempotency_key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key)) {
      throw new Error('معرّف الإرسال غير صالح.');
    }

    const idempotencyHash = await sha256Hex(body.idempotency_key);
    const accessToken = await createParticipantToken(body.idempotency_key);
    const accessHash = await sha256Hex(accessToken);
    let submission: Record<string, any> | null = null;

    const { data: existing, error: existingError } = await client
      .from('ghawthani_submissions')
      .select('*')
      .eq('idempotency_key_hash', idempotencyHash)
      .maybeSingle();
    if (existingError) throw existingError;
    submission = existing;

    if (!submission) {
      const { data: inserted, error: insertError } = await client
        .from('ghawthani_submissions')
        .insert({
          program_id: program.id,
          full_name: fullName,
          gender,
          attended_day_1: day1,
          attended_day_2: day2,
          attended_day_3: day3,
          acknowledged: true,
          idempotency_key_hash: idempotencyHash,
          access_token_hash: accessHash,
        })
        .select('*')
        .single();
      if (insertError) {
        if (insertError.code !== '23505') throw insertError;
        const { data: raced, error: raceError } = await client
          .from('ghawthani_submissions')
          .select('*')
          .eq('idempotency_key_hash', idempotencyHash)
          .single();
        if (raceError) throw raceError;
        submission = raced;
      } else {
        submission = inserted;
      }
    }

    if (submission.access_token_hash !== accessHash) throw new Error('تعذر استعادة الإرسال السابق بأمان.');
    if (!['completed', 'not_required'].includes(submission.generation_status)) {
      try {
        await issueSubmissionDocuments(client, submission);
      } catch {
        // The durable failure is returned below with the submission instead of
        // losing the participant's successfully stored declaration.
      }
    }

    const { data: refreshed, error: refreshError } = await client
      .from('ghawthani_submissions')
      .select('*')
      .eq('id', submission.id)
      .single();
    if (refreshError) throw refreshError;

    return jsonResponse({
      submission: safeSubmission(refreshed),
      access_token: accessToken,
      documents: await signedDocuments(client, refreshed.id),
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
});
