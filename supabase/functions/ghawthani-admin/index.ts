import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { constantTimeEqual, createAdminToken, createParticipantToken, sha256Hex, verifyAdminToken } from '../_shared/crypto.ts';
import { issueSubmissionDocuments, signedDocuments } from '../_shared/issuance.ts';
import { ARABIC_FONT_FAMILIES, cleanParticipantName, personalizePdf, readBundledArabicFont, type ArabicFontFamily, type NamePlacement } from '../_shared/pdf.ts';

const BUCKET = 'ijazah-private';
const TEMPLATE_TYPES = ['ijazah_male', 'ijazah_female', 'participation_certificate'] as const;
const SUBMISSION_SELECT = `
  id, program_id, full_name, gender, attended_day_1, attended_day_2, attended_day_3,
  attendance_count, eligibility, generation_status, generation_error,
  entitlement_id, certificate_eligible, ijazah_eligible, eligibility_source,
  approval_status, approved_at, approval_note, revoked_at, revoked_reason,
  generation_started_at, generation_completed_at, submitted_at, updated_at,
  documents:ghawthani_issued_documents(
    id, document_type, template_version_id, generation_status,
    storage_bucket, storage_path, file_sha256, generation_error, issued_at
  )
`;

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('إعدادات Supabase الخادمية غير مكتملة.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`قيمة ${label} غير صالحة.`);
  return number;
}

function placement(body: Record<string, unknown>, pageWidth: number, pageHeight: number, pageCount: number): NamePlacement {
  const config: NamePlacement = {
    page_index: Math.trunc(asNumber(body.page_index, 'رقم الصفحة')),
    page_width: pageWidth,
    page_height: pageHeight,
    name_x: asNumber(body.name_x, 'الموضع الأفقي'),
    name_y: asNumber(body.name_y, 'الموضع العمودي'),
    name_width: asNumber(body.name_width, 'عرض منطقة الاسم'),
    name_height: asNumber(body.name_height, 'ارتفاع منطقة الاسم'),
    font_size: asNumber(body.font_size, 'حجم الخط'),
    min_font_size: asNumber(body.min_font_size, 'الحد الأدنى للخط'),
    font_color: typeof body.font_color === 'string' ? body.font_color : '#171717',
    font_family: ARABIC_FONT_FAMILIES.includes(body.font_family as ArabicFontFamily)
      ? body.font_family as ArabicFontFamily
      : 'noto_naskh',
    alignment: body.alignment === 'left' || body.alignment === 'right' ? body.alignment : 'center',
  };
  if (config.page_index < 0 || config.page_index >= pageCount) throw new Error('رقم صفحة الاسم خارج نطاق القالب.');
  if (config.name_x < 0 || config.name_y < 0 || config.name_width <= 0 || config.name_height <= 0) {
    throw new Error('أبعاد منطقة الاسم غير صالحة.');
  }
  if (config.name_x + config.name_width > pageWidth + 0.5 || config.name_y + config.name_height > pageHeight + 0.5) {
    throw new Error('منطقة الاسم تتجاوز حدود الصفحة.');
  }
  if (config.font_size < 8 || config.font_size > 72 || config.min_font_size < 8 || config.min_font_size > config.font_size) {
    throw new Error('أحجام الخط غير صالحة.');
  }
  if (!/^#[0-9a-f]{6}$/i.test(config.font_color)) throw new Error('لون الخط غير صالح.');
  return config;
}

function templateInsert(programId: string, templateType: string, filename: string, storagePath: string, hash: string, pages: number, config: NamePlacement) {
  return {
    program_id: programId,
    template_type: templateType,
    original_filename: filename,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    file_sha256: hash,
    page_count: pages,
    ...config,
    is_validated: false,
    is_active: false,
  };
}

function decodeBase64(value: unknown) {
  if (typeof value !== 'string') throw new Error('بيانات ملف PDF مفقودة.');
  const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('تعذر قراءة ملف PDF المرفوع.');
  }
  if (binary.length > 10 * 1024 * 1024) throw new Error('حجم القالب يتجاوز 10 ميغابايت.');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('الملف المرفوع ليس PDF صالحًا.');
  return bytes;
}

async function signedTemplate(client: SupabaseClient, row: Record<string, any>) {
  const { data, error } = await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
  if (error) throw error;
  return { ...row, preview_url: data.signedUrl, preview_expires_in: 300 };
}

async function requireAdmin(request: Request) {
  const token = request.headers.get('x-ghawthani-admin') || '';
  if (!await verifyAdminToken(token)) throw new Error('انتهت جلسة الإدارة أو أنها غير صالحة.');
}

function requireAllowedOrigin(request: Request) {
  const configured = Deno.env.get('GH_A_ALLOWED_ORIGINS');
  if (!configured) throw new Error('نطاق لوحة الإدارة المسموح غير مضبوط على الخادم.');
  const origin = request.headers.get('origin');
  if (!origin) return;
  try {
    const host = new URL(origin).hostname;
    // Local development remains usable without weakening production origins.
    if (host === 'localhost' || host === '127.0.0.1') return;
  } catch {
    throw new Error('نطاق الطلب غير صالح.');
  }
  const allowed = configured.split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new Error('هذا النطاق غير مصرح له باستخدام إدارة الإجازات والشهادات.');
}

function requireProgramId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('يرجى اختيار برنامج الإجازات والشهادات.');
  return value;
}

function optionalDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`قيمة ${label} غير صالحة.`);
  return new Date(value).toISOString();
}

async function syncExamEntitlements(client: SupabaseClient, program: Record<string, any>) {
  if (program.eligibility_method !== 'passed_exam' || !program.dawra_id) return;
  const { data: exams, error: examsError } = await client
    .from('shmoury_exams')
    .select('id')
    .eq('dawra_id', program.dawra_id);
  if (examsError || !exams?.length) return;
  const examIds = exams.map((row) => row.id);
  const { data: passedSubmissions, error: passedError } = await client
    .from('shmoury_submissions')
    .select('id, student_name')
    .in('exam_id', examIds)
    .eq('status', 'passed')
    .order('submitted_at', { ascending: false });
  if (passedError || !passedSubmissions?.length) return;
  const { data: existingEntitlements, error: existingError } = await client
    .from('ijazah_entitlements')
    .select('id, source_id')
    .eq('program_id', program.id)
    .eq('source_type', 'exam_submission');
  if (existingError) return;
  const existingSourceIds = new Set((existingEntitlements || []).map((row) => row.source_id).filter(Boolean));
  const certificateEligible = program.offers_certificate !== false;
  const ijazahEligible = program.offers_ijazah !== false;
  if (!certificateEligible && !ijazahEligible) return;

  for (const examSub of passedSubmissions) {
    if (existingSourceIds.has(examSub.id)) continue;
    try {
      const fullName = cleanParticipantName(examSub.student_name);
      const id = crypto.randomUUID();
      const token = await createParticipantToken(`entitlement:${id}`);
      await client.from('ijazah_entitlements').insert({
        id,
        program_id: program.id,
        source_type: 'exam_submission',
        source_id: examSub.id,
        full_name: fullName,
        certificate_eligible: certificateEligible,
        ijazah_eligible: ijazahEligible,
        access_token_hash: await sha256Hex(token),
      });
    } catch {
      // Ignore individual rows with invalid names or concurrent inserts.
    }
  }
}

async function summary(client: SupabaseClient, programId: string) {
  const [all, ijazah, certificateOnly, failures, entitlements, issued, pendingApprovals, revokedCount] = await Promise.all([
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId),
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId).or('ijazah_eligible.eq.true,and(ijazah_eligible.is.null,eligibility.eq.ijazah_and_certificate)'),
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId).or('and(certificate_eligible.eq.true,or(ijazah_eligible.eq.false,ijazah_eligible.is.null)),and(certificate_eligible.is.null,eligibility.eq.certificate_only)'),
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId).eq('generation_status', 'failed'),
    client.from('ijazah_entitlements').select('id', { count: 'exact', head: true }).eq('program_id', programId).is('revoked_at', null),
    client.from('ghawthani_issued_documents').select('id, submission:ghawthani_submissions!inner(program_id)', { count: 'exact', head: true }).eq('submission.program_id', programId).eq('generation_status', 'issued'),
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId).eq('approval_status', 'pending_approval'),
    client.from('ghawthani_submissions').select('id', { count: 'exact', head: true }).eq('program_id', programId).not('revoked_at', 'is', null),
  ]);
  const error = [all, ijazah, certificateOnly, failures, entitlements, issued, pendingApprovals, revokedCount].find((result) => result.error)?.error;
  if (error) throw error;
  return {
    submissions: all.count || 0,
    ijazah_eligible: ijazah.count || 0,
    certificate_only: certificateOnly.count || 0,
    generation_failures: failures.count || 0,
    eligible_participants: entitlements.count || 0,
    issued_documents: issued.count || 0,
    pending_approvals: pendingApprovals.count || 0,
    revoked_count: revokedCount.count || 0,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('الطريقة غير مدعومة.'), 405);

  try {
    requireAllowedOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'login') {
      const configuredCode = Deno.env.get('GH_A_ADMIN_CODE');
      const suppliedCode = typeof body.code === 'string' ? body.code : '';
      if (!configuredCode || configuredCode.length < 12) throw new Error('رمز الإدارة الآمن غير مضبوط على الخادم.');
      if (!constantTimeEqual(suppliedCode, configuredCode)) return errorResponse(new Error('الرمز غير صحيح.'), 401);
      return jsonResponse({ token: await createAdminToken(), expires_in: 14400 });
    }

    await requireAdmin(request);
    const client = serviceClient();

    if (action === 'list_programs') {
      const { data, error } = await client.from('ijazah_programs').select('*').order('created_at');
      if (error) throw error;
      return jsonResponse({ programs: data || [] });
    }

    if (action === 'save_program') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const courseSubject = typeof body.course_subject === 'string' ? body.course_subject.trim() : '';
      const instructorName = typeof body.instructor_name === 'string' ? body.instructor_name.trim() : '';
      const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
      if (title.length < 3 || courseSubject.length < 3 || instructorName.length < 3) throw new Error('أكمل عنوان البرنامج وموضوع الدورة واسم المحاضر.');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('الرابط المختصر يقبل أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.');
      const offersCertificate = body.offers_certificate !== false;
      const offersIjazah = body.offers_ijazah !== false;
      if (!offersCertificate && !offersIjazah) throw new Error('يجب تفعيل الشهادة أو الإجازة على الأقل.');
      const eligibilityMethod = ['legacy_attendance', 'passed_exam', 'manual'].includes(String(body.eligibility_method))
        ? String(body.eligibility_method)
        : 'legacy_attendance';
      const availableFrom = optionalDate(body.available_from, 'بداية الإتاحة');
      const availableUntil = optionalDate(body.available_until, 'نهاية الإتاحة');
      if (availableFrom && availableUntil && Date.parse(availableUntil) <= Date.parse(availableFrom)) {
        throw new Error('يجب أن تكون نهاية الإتاحة بعد بدايتها.');
      }
      const values = {
        dawra_id: typeof body.dawra_id === 'string' && body.dawra_id ? body.dawra_id : null,
        slug,
        title,
        course_subject: courseSubject,
        instructor_name: instructorName,
        introduction: typeof body.introduction === 'string' ? body.introduction.trim() : '',
        trust_statement: typeof body.trust_statement === 'string' && body.trust_statement.trim()
          ? body.trust_statement.trim()
          : 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.',
        is_active: body.is_active !== false,
        offers_certificate: offersCertificate,
        offers_ijazah: offersIjazah,
        eligibility_method: eligibilityMethod,
        requires_approval: body.requires_approval === true,
        available_from: availableFrom,
        available_until: availableUntil,
      };
      const programId = typeof body.program_id === 'string' ? body.program_id : '';
      const query = programId
        ? client.from('ijazah_programs').update(values).eq('id', programId)
        : client.from('ijazah_programs').insert(values);
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      if (data.eligibility_method === 'passed_exam') {
        await syncExamEntitlements(client, data);
      }
      return jsonResponse({ program: data });
    }

    if (action === 'list_entitlements') {
      const programId = requireProgramId(body.program_id);
      const { data: program, error: programError } = await client
        .from('ijazah_programs')
        .select('*')
        .eq('id', programId)
        .single();
      if (programError) throw programError;
      if (program.eligibility_method === 'passed_exam') {
        await syncExamEntitlements(client, program);
      }
      const { data: entitlements, error } = await client
        .from('ijazah_entitlements')
        .select('*')
        .eq('program_id', programId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (entitlements || []).map((row) => row.id);
      let requests: Record<string, any>[] = [];
      if (ids.length) {
        const { data, error: requestsError } = await client
          .from('ghawthani_submissions')
          .select(SUBMISSION_SELECT)
          .in('entitlement_id', ids);
        if (requestsError) throw requestsError;
        requests = data || [];
      }
      const byEntitlement = new Map(requests.map((row) => [row.entitlement_id, row]));
      return jsonResponse({
        rows: (entitlements || []).map((row) => ({ ...row, request: byEntitlement.get(row.id) || null })),
      });
    }

    if (action === 'create_entitlement') {
      const programId = requireProgramId(body.program_id);
      const { data: program, error: programError } = await client.from('ijazah_programs').select('*').eq('id', programId).single();
      if (programError) throw programError;
      if (program.eligibility_method !== 'manual') throw new Error('يجب اختيار التأهيل اليدوي في إعدادات البرنامج أولًا.');
      const fullName = cleanParticipantName(body.full_name);
      const gender = body.gender === 'male' || body.gender === 'female' ? body.gender : null;
      const certificateEligible = body.certificate_eligible === true && program.offers_certificate !== false;
      const ijazahEligible = body.ijazah_eligible === true && program.offers_ijazah !== false;
      if (!certificateEligible && !ijazahEligible) throw new Error('حدد نوع مستند واحد على الأقل.');
      const id = crypto.randomUUID();
      const token = await createParticipantToken(`entitlement:${id}`);
      const { data, error } = await client.from('ijazah_entitlements').insert({
        id,
        program_id: programId,
        source_type: 'manual',
        full_name: fullName,
        gender,
        certificate_eligible: certificateEligible,
        ijazah_eligible: ijazahEligible,
        access_token_hash: await sha256Hex(token),
      }).select('*').single();
      if (error) throw error;
      return jsonResponse({
        entitlement: data,
        participant_claim: { kind: 'entitlement', id, token, program_slug: program.slug },
        participant_url: `/certificates?claim=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`,
      });
    }

    if (action === 'entitlement_access') {
      const { data, error } = await client
        .from('ijazah_entitlements')
        .select('id, program:ijazah_programs(slug), revoked_at')
        .eq('id', body.entitlement_id)
        .single();
      if (error) throw error;
      if (data.revoked_at) throw new Error('تم إلغاء هذا الاستحقاق.');
      const token = await createParticipantToken(`entitlement:${data.id}`);
      return jsonResponse({
        participant_claim: { kind: 'entitlement', id: data.id, token },
        participant_url: `/certificates?claim=${encodeURIComponent(data.id)}&token=${encodeURIComponent(token)}`,
      });
    }

    if (action === 'revoke_entitlement') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      const nowIso = new Date().toISOString();
      const { data, error } = await client.from('ijazah_entitlements').update({
        revoked_at: nowIso,
        revoked_reason: reason || null,
      }).eq('id', body.entitlement_id).select('*').single();
      if (error) throw error;
      await client.from('ghawthani_submissions').update({
        revoked_at: nowIso,
        revoked_reason: reason || null,
      }).eq('entitlement_id', data.id);
      return jsonResponse({ entitlement: data });
    }

    if (action === 'restore_entitlement') {
      const { data, error } = await client.from('ijazah_entitlements').update({
        revoked_at: null,
        revoked_reason: null,
      }).eq('id', body.entitlement_id).select('*').single();
      if (error) throw error;
      await client.from('ghawthani_submissions').update({
        revoked_at: null,
        revoked_reason: null,
      }).eq('entitlement_id', data.id);
      return jsonResponse({ entitlement: data });
    }

    if (action === 'summary') return jsonResponse({ summary: await summary(client, requireProgramId(body.program_id)) });

    if (action === 'list_submissions') {
      const programId = requireProgramId(body.program_id);
      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(body.page_size) || 20)));
      let query = client.from('ghawthani_submissions').select(SUBMISSION_SELECT, { count: 'exact' }).eq('program_id', programId);
      if (typeof body.search === 'string' && body.search.trim()) query = query.ilike('full_name', `%${body.search.trim().replace(/[%_,]/g, '')}%`);
      if (body.gender === 'male' || body.gender === 'female') query = query.eq('gender', body.gender);
      if (['none', 'certificate_only', 'ijazah_and_certificate'].includes(String(body.eligibility))) query = query.eq('eligibility', body.eligibility);
      if (['pending', 'processing', 'completed', 'failed', 'not_required'].includes(String(body.generation_status))) query = query.eq('generation_status', body.generation_status);
      if (['pending_approval', 'approved', 'rejected'].includes(String(body.approval_status))) query = query.eq('approval_status', body.approval_status);
      if (body.revoked === 'revoked') query = query.not('revoked_at', 'is', null);
      if (body.revoked === 'active') query = query.is('revoked_at', null);
      if ([0, 1, 2, 3].includes(Number(body.attendance_count))) query = query.eq('attendance_count', Number(body.attendance_count));
      const from = (page - 1) * pageSize;
      const { data, count, error } = await query.order('submitted_at', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw error;
      return jsonResponse({ rows: data || [], count: count || 0, page, page_size: pageSize, summary: await summary(client, programId) });
    }

    if (action === 'submission_details') {
      const { data, error } = await client.from('ghawthani_submissions').select(SUBMISSION_SELECT).eq('id', body.submission_id).single();
      if (error) throw error;
      return jsonResponse({ submission: data });
    }

    if (action === 'approve_submission') {
      const rawNote = typeof body.note === 'string' ? body.note : typeof body.approval_note === 'string' ? body.approval_note : '';
      const note = rawNote.trim().slice(0, 500);
      const { data: submission, error: updateError } = await client
        .from('ghawthani_submissions')
        .update({
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
          approval_note: note || null,
          generation_status: 'pending',
          generation_error: null,
        })
        .eq('id', body.submission_id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      try {
        await issueSubmissionDocuments(client, submission);
      } catch {
        // Keep approval recorded even if PDF generation fails; admin sees the error state and can retry.
      }
      const { data: refreshed, error: refreshedError } = await client.from('ghawthani_submissions').select(SUBMISSION_SELECT).eq('id', submission.id).single();
      if (refreshedError) throw refreshedError;
      return jsonResponse({ submission: refreshed });
    }

    if (action === 'reject_submission') {
      const rawNote = typeof body.note === 'string' ? body.note : typeof body.approval_note === 'string' ? body.approval_note : '';
      const note = rawNote.trim().slice(0, 500);
      const { data: refreshed, error } = await client
        .from('ghawthani_submissions')
        .update({
          approval_status: 'rejected',
          approval_note: note || null,
          generation_status: 'not_required',
          generation_error: null,
        })
        .eq('id', body.submission_id)
        .select(SUBMISSION_SELECT)
        .single();
      if (error) throw error;
      return jsonResponse({ submission: refreshed });
    }

    if (action === 'revoke_submission') {
      const rawReason = typeof body.reason === 'string' ? body.reason : typeof body.revoked_reason === 'string' ? body.revoked_reason : '';
      const reason = rawReason.trim().slice(0, 500);
      const nowIso = new Date().toISOString();
      const { data: refreshed, error } = await client
        .from('ghawthani_submissions')
        .update({
          revoked_at: nowIso,
          revoked_reason: reason || null,
        })
        .eq('id', body.submission_id)
        .select(SUBMISSION_SELECT)
        .single();
      if (error) throw error;
      if (refreshed.entitlement_id) {
        await client.from('ijazah_entitlements').update({
          revoked_at: nowIso,
          revoked_reason: reason || null,
        }).eq('id', refreshed.entitlement_id);
      }
      return jsonResponse({ submission: refreshed });
    }

    if (action === 'restore_submission') {
      const { data: refreshed, error } = await client
        .from('ghawthani_submissions')
        .update({
          revoked_at: null,
          revoked_reason: null,
        })
        .eq('id', body.submission_id)
        .select(SUBMISSION_SELECT)
        .single();
      if (error) throw error;
      if (refreshed.entitlement_id) {
        await client.from('ijazah_entitlements').update({
          revoked_at: null,
          revoked_reason: null,
        }).eq('id', refreshed.entitlement_id);
      }
      return jsonResponse({ submission: refreshed });
    }

    if (action === 'delete_submission') {
      const { data: documents, error: documentsError } = await client
        .from('ghawthani_issued_documents')
        .select('storage_bucket, storage_path')
        .eq('submission_id', body.submission_id);
      if (documentsError) throw documentsError;
      const { data: deleted, error: deleteError } = await client
        .from('ghawthani_submissions')
        .delete()
        .eq('id', body.submission_id)
        .select('id')
        .single();
      if (deleteError) throw deleteError;
      const pathsByBucket = new Map<string, string[]>();
      for (const document of documents || []) {
        const paths = pathsByBucket.get(document.storage_bucket) || [];
        paths.push(document.storage_path);
        pathsByBucket.set(document.storage_bucket, paths);
      }
      for (const [bucket, paths] of pathsByBucket) {
        const { error: cleanupError } = await client.storage.from(bucket).remove(paths);
        if (cleanupError) console.error('Failed to remove deleted submission files', cleanupError);
      }
      return jsonResponse({ deleted_submission_id: deleted.id });
    }

    if (action === 'retry') {
      const { data: submission, error } = await client.from('ghawthani_submissions').select('*').eq('id', body.submission_id).single();
      if (error) throw error;
      if (submission.revoked_at) throw new Error('تم إلغاء صلاحية هذا الطلب ولا يمكن إعادة توليده.');
      if (submission.approval_status && submission.approval_status !== 'approved') {
        throw new Error('يجب اعتماد الطلب من الإدارة قبل إعادة محاولة التوليد.');
      }
      if (submission.generation_status === 'completed' || submission.generation_status === 'not_required') {
        throw new Error('لا يحتاج هذا الطلب إلى إعادة توليد.');
      }
      await issueSubmissionDocuments(client, submission);
      const { data: refreshed, error: refreshedError } = await client.from('ghawthani_submissions').select(SUBMISSION_SELECT).eq('id', submission.id).single();
      if (refreshedError) throw refreshedError;
      return jsonResponse({ submission: refreshed });
    }

    if (action === 'document_url') {
      const { data: document, error } = await client.from('ghawthani_issued_documents').select('*').eq('id', body.document_id).single();
      if (error) throw error;
      if (document.generation_status !== 'issued') throw new Error('المستند غير جاهز للعرض.');
      const { data: signed, error: signedError } = await client.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 300, { download: body.download === true });
      if (signedError) throw signedError;
      return jsonResponse({ url: signed.signedUrl, expires_in: 300 });
    }

    if (action === 'list_templates') {
      const programId = requireProgramId(body.program_id);
      const { data, error } = await client.from('ghawthani_template_versions').select('*').eq('program_id', programId).order('template_type').order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ templates: await Promise.all((data || []).map((row) => signedTemplate(client, row))) });
    }

    if (action === 'deactivate_templates') {
      const programId = requireProgramId(body.program_id);
      const { data, error } = await client
        .from('ghawthani_template_versions')
        .update({ is_active: false, activated_at: null })
        .eq('program_id', programId)
        .eq('is_active', true)
        .select('id');
      if (error) throw error;
      return jsonResponse({ deactivated_count: data?.length || 0 });
    }

    if (action === 'delete_template') {
      const { data: template, error: templateError } = await client
        .from('ghawthani_template_versions')
        .select('*')
        .eq('id', body.template_id)
        .single();
      if (templateError) throw templateError;
      const { count: issuedCount, error: issuedError } = await client
        .from('ghawthani_issued_documents')
        .select('id', { count: 'exact', head: true })
        .eq('template_version_id', template.id);
      if (issuedError) throw issuedError;
      if (issuedCount) throw new Error('لا يمكن حذف هذه النسخة لأن مستندات صادرة تعتمد عليها. يمكنك إلغاء تفعيلها بدلًا من ذلك.');
      const { error: deleteError } = await client.from('ghawthani_template_versions').delete().eq('id', template.id);
      if (deleteError) throw deleteError;
      const paths = [template.storage_path, template.sample_storage_path].filter((value): value is string => Boolean(value));
      if (paths.length) {
        const { error: cleanupError } = await client.storage.from(template.storage_bucket).remove(paths);
        if (cleanupError) console.error('Failed to remove deleted template files', cleanupError);
      }
      return jsonResponse({ deleted_template_id: template.id });
    }

    if (action === 'upload_template') {
      const programId = requireProgramId(body.program_id);
      const templateType = TEMPLATE_TYPES.includes(body.template_type as any) ? String(body.template_type) : null;
      if (!templateType) throw new Error('نوع القالب غير صالح.');
      const filename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim().slice(0, 180) : 'template.pdf';
      const bytes = decodeBase64(body.file_base64);
      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      } catch {
        throw new Error('تعذر فتح PDF. تأكد من أنه غير مشفّر أو تالف.');
      }
      const pages = pdf.getPages();
      if (!pages.length) throw new Error('القالب لا يحتوي على صفحات.');
      const pageIndex = Math.trunc(Number(body.page_index) || 0);
      const selectedPage = pages[pageIndex];
      if (!selectedPage) throw new Error('صفحة وضع الاسم غير موجودة.');
      const size = selectedPage.getSize();
      const config = placement(body, size.width, size.height, pages.length);
      const id = crypto.randomUUID();
      const storagePath = `templates/${programId}/${templateType}/${id}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', cacheControl: '0', upsert: false });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await client.from('ghawthani_template_versions')
        .insert(templateInsert(programId, templateType, filename, storagePath, await sha256Hex(bytes), pages.length, config))
        .select('*').single();
      if (insertError) {
        await client.storage.from(BUCKET).remove([storagePath]);
        throw insertError;
      }
      return jsonResponse({ template: await signedTemplate(client, inserted) });
    }

    if (action === 'save_template_config') {
      const { data: current, error } = await client.from('ghawthani_template_versions').select('*').eq('id', body.template_id).single();
      if (error) throw error;
      const config = placement(body, Number(current.page_width), Number(current.page_height), Number(current.page_count));
      if (!current.is_active) {
        const { data: updated, error: updateError } = await client.from('ghawthani_template_versions').update({
          ...config,
          is_validated: false,
          validated_at: null,
          sample_storage_path: null,
          sample_generated_at: null,
        }).eq('id', current.id).select('*').single();
        if (updateError) throw updateError;
        return jsonResponse({ template: await signedTemplate(client, updated), created_new_version: false });
      }
      const { data: blob, error: downloadError } = await client.storage.from(current.storage_bucket).download(current.storage_path);
      if (downloadError || !blob) throw downloadError || new Error('تعذر قراءة القالب الحالي.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const newId = crypto.randomUUID();
      const newPath = `templates/${current.program_id}/${current.template_type}/${newId}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(newPath, bytes, { contentType: 'application/pdf', cacheControl: '0', upsert: false });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await client.from('ghawthani_template_versions').insert(templateInsert(
        current.program_id, current.template_type, current.original_filename, newPath, current.file_sha256, current.page_count, config,
      )).select('*').single();
      if (insertError) {
        await client.storage.from(BUCKET).remove([newPath]);
        throw insertError;
      }
      return jsonResponse({ template: await signedTemplate(client, inserted), created_new_version: true });
    }

    if (action === 'generate_sample') {
      const sampleName = cleanParticipantName(body.sample_name || 'عبد الله محمد أحمد');
      const { data: template, error } = await client.from('ghawthani_template_versions').select('*').eq('id', body.template_id).single();
      if (error) throw error;
      const { data: blob, error: downloadError } = await client.storage.from(template.storage_bucket).download(template.storage_path);
      if (downloadError || !blob) throw downloadError || new Error('تعذر تنزيل القالب.');
      const output = await personalizePdf(
        new Uint8Array(await blob.arrayBuffer()),
        await readBundledArabicFont(template.font_family || 'noto_naskh'),
        sampleName,
        template as NamePlacement,
      );
      const samplePath = `samples/${template.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(samplePath, output, { contentType: 'application/pdf', cacheControl: '0', upsert: false });
      if (uploadError) throw uploadError;
      const { data: updatedTemplate, error: sampleRecordError } = await client.from('ghawthani_template_versions').update({
        sample_storage_path: samplePath,
        sample_generated_at: new Date().toISOString(),
        is_validated: false,
        validated_at: null,
        is_active: false,
        activated_at: null,
      }).eq('id', template.id).select('*').single();
      if (sampleRecordError) throw sampleRecordError;
      if (template.sample_storage_path && template.sample_storage_path !== samplePath) {
        await client.storage.from(BUCKET).remove([template.sample_storage_path]);
      }
      const { data: signed, error: signedError } = await client.storage.from(BUCKET).createSignedUrl(samplePath, 600);
      if (signedError) throw signedError;
      return jsonResponse({
        sample_url: signed.signedUrl,
        expires_in: 600,
        sample_name: sampleName,
        template: await signedTemplate(client, updatedTemplate),
      });
    }

    if (action === 'validate_template') {
      const { data: candidate, error: candidateError } = await client.from('ghawthani_template_versions')
        .select('id, sample_storage_path, sample_generated_at')
        .eq('id', body.template_id)
        .single();
      if (candidateError) throw candidateError;
      if (!candidate.sample_storage_path || !candidate.sample_generated_at) throw new Error('يجب إنشاء عينة من الإعداد الحالي قبل اعتماد القالب.');
      const { data, error } = await client.from('ghawthani_template_versions').update({ is_validated: true, validated_at: new Date().toISOString() }).eq('id', body.template_id).select('*').single();
      if (error) throw error;
      return jsonResponse({ template: await signedTemplate(client, data) });
    }

    if (action === 'activate_template') {
      const { data, error } = await client.rpc('ghawthani_activate_template', { target_id: body.template_id });
      if (error) throw error;
      return jsonResponse({ template: await signedTemplate(client, data) });
    }

    if (action === 'participant_documents') {
      return jsonResponse({ documents: await signedDocuments(client, String(body.submission_id)) });
    }

    throw new Error('الإجراء غير مدعوم.');
  } catch (error) {
    const unauthorized = error instanceof Error && error.message.includes('جلسة الإدارة');
    return errorResponse(error, unauthorized ? 401 : 400);
  }
});
