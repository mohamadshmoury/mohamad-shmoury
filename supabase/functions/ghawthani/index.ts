import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createParticipantToken, sha256Hex } from '../_shared/crypto.ts';
import { issueSubmissionDocuments, signedDocuments } from '../_shared/issuance.ts';
import { cleanParticipantName } from '../_shared/pdf.ts';
import { assertProgramAvailable, offeredDocumentTypes, programAvailability } from '../_shared/programs.ts';
import { expectedDocumentTypes } from '../_shared/eligibility.ts';

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
    certificate_eligible: row.certificate_eligible,
    ijazah_eligible: row.ijazah_eligible,
    eligibility_source: row.eligibility_source || 'legacy_attendance',
    approval_status: (row.approval_status || 'approved') as 'pending_approval' | 'approved' | 'rejected',
    approved_at: row.approved_at || null,
    approval_note: row.approval_note || null,
    revoked_at: row.revoked_at || null,
    revoked_reason: row.revoked_reason || null,
    generation_status: row.generation_status,
    generation_error: row.generation_error,
    submitted_at: row.submitted_at,
  };
}

function safeProgram(row: Record<string, any>) {
  return {
    id: row.id,
    dawra_id: row.dawra_id,
    slug: row.slug,
    title: row.title,
    course_subject: row.course_subject,
    instructor_name: row.instructor_name,
    introduction: row.introduction,
    trust_statement: row.trust_statement,
    is_active: row.is_active,
    offers_certificate: row.offers_certificate !== false,
    offers_ijazah: row.offers_ijazah !== false,
    eligibility_method: row.eligibility_method || 'legacy_attendance',
    requires_approval: Boolean(row.requires_approval),
    available_from: row.available_from || null,
    available_until: row.available_until || null,
  };
}

async function findAuthorizedSubmission(
  client: ReturnType<typeof serviceClient>,
  id: unknown,
  token: unknown,
  options: { allowRevoked?: boolean } = {},
) {
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
  let revokedAt: string | null = data.revoked_at || null;
  let revokedReason: string | null = data.revoked_reason || null;
  if (data.entitlement_id) {
    const { data: entitlement, error: entitlementError } = await client
      .from('ijazah_entitlements')
      .select('revoked_at, revoked_reason')
      .eq('id', data.entitlement_id)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement) {
      revokedAt = revokedAt || new Date().toISOString();
    } else if (entitlement.revoked_at) {
      revokedAt = revokedAt || entitlement.revoked_at;
      revokedReason = revokedReason || entitlement.revoked_reason || null;
    }
  }
  if (revokedAt && !options.allowRevoked) {
    throw new Error('تم إلغاء صلاحية الوصول إلى هذه المستندات.');
  }
  return { ...data, revoked_at: revokedAt, revoked_reason: revokedReason };
}

async function findAuthorizedEntitlement(
  client: ReturnType<typeof serviceClient>,
  id: unknown,
  token: unknown,
  options: { allowRevoked?: boolean } = {},
) {
  if (typeof id !== 'string' || typeof token !== 'string') throw new Error('بيانات الوصول إلى الاستحقاق غير مكتملة.');
  const accessHash = await sha256Hex(token);
  const { data, error } = await client
    .from('ijazah_entitlements')
    .select('*')
    .eq('id', id)
    .eq('access_token_hash', accessHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('تعذر التحقق من صلاحية الوصول إلى هذا الاستحقاق.');
  if (data.revoked_at && !options.allowRevoked) {
    throw new Error('تم إلغاء صلاحية الوصول إلى هذا الاستحقاق.');
  }
  return data;
}

async function getProgram(client: ReturnType<typeof serviceClient>, programId: string) {
  const { data, error } = await client.from('ijazah_programs').select('*').eq('id', programId).single();
  if (error) throw error;
  return data;
}

async function portfolioEntryForSubmission(client: ReturnType<typeof serviceClient>, submission: Record<string, any>) {
  const program = await getProgram(client, submission.program_id);
  const revoked = Boolean(submission.revoked_at);
  const documents = revoked ? [] : await signedDocuments(client, submission.id);
  const types = expectedDocumentTypes(submission as any, program);
  const availability = programAvailability(program);
  const approvalStatus = submission.approval_status || 'approved';
  return {
    claim_kind: 'submission',
    claim_id: submission.id,
    program: safeProgram(program),
    availability,
    full_name: submission.full_name,
    gender: submission.gender,
    eligible_document_types: types,
    request: safeSubmission(submission),
    documents,
    revoked,
    revoked_reason: submission.revoked_reason || null,
    visible: !revoked && (
      documents.length > 0
      || (availability.available && types.length > 0)
      || (types.length > 0 && approvalStatus === 'pending_approval')
    ),
  };
}

async function portfolioEntryForEntitlement(client: ReturnType<typeof serviceClient>, entitlement: Record<string, any>) {
  const program = await getProgram(client, entitlement.program_id);
  const { data: request, error: requestError } = await client
    .from('ghawthani_submissions')
    .select('*')
    .eq('entitlement_id', entitlement.id)
    .maybeSingle();
  if (requestError) throw requestError;
  const revoked = Boolean(entitlement.revoked_at || request?.revoked_at);
  const revokedReason = entitlement.revoked_reason || request?.revoked_reason || null;
  const documents = request && !revoked ? await signedDocuments(client, request.id) : [];
  const types = expectedDocumentTypes({
    gender: request?.gender || entitlement.gender || 'male',
    attended_day_1: false,
    attended_day_2: false,
    attended_day_3: false,
    certificate_eligible: entitlement.certificate_eligible,
    ijazah_eligible: entitlement.ijazah_eligible,
  }, program);
  const availability = programAvailability(program);
  const approvalStatus = request?.approval_status || 'approved';
  return {
    claim_kind: 'entitlement',
    claim_id: entitlement.id,
    program: safeProgram(program),
    availability,
    full_name: request?.full_name || entitlement.full_name,
    gender: request?.gender || entitlement.gender,
    eligible_document_types: types,
    request: request ? safeSubmission({ ...request, revoked_at: revoked ? (request.revoked_at || entitlement.revoked_at) : null, revoked_reason: revokedReason }) : null,
    documents,
    revoked,
    revoked_reason: revokedReason,
    visible: !revoked && (
      documents.length > 0
      || (availability.available && types.length > 0)
      || (Boolean(request) && types.length > 0 && approvalStatus === 'pending_approval')
    ),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('الطريقة غير مدعومة.'), 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'submit';
    const client = serviceClient();

    if (action === 'portfolio') {
      const claims = Array.isArray(body.claims) ? body.claims.slice(0, 50) : [];
      const entries: Record<string, any>[] = [];
      const invalidClaims: Array<{ kind: string; id: string }> = [];
      const seen = new Set<string>();
      for (const rawClaim of claims) {
        if (!rawClaim || typeof rawClaim !== 'object') continue;
        const claim = rawClaim as Record<string, unknown>;
        const kind = claim.kind === 'entitlement' ? 'entitlement' : claim.kind === 'submission' ? 'submission' : '';
        const id = typeof claim.id === 'string' ? claim.id : '';
        const token = typeof claim.token === 'string' ? claim.token : '';
        const key = `${kind}:${id}`;
        if (!kind || !id || !token || seen.has(key)) continue;
        seen.add(key);
        try {
          entries.push(kind === 'submission'
            ? await portfolioEntryForSubmission(client, await findAuthorizedSubmission(client, id, token, { allowRevoked: true }))
            : await portfolioEntryForEntitlement(client, await findAuthorizedEntitlement(client, id, token, { allowRevoked: true })));
        } catch {
          // One invalid or tampered browser claim must not hide other courses.
          invalidClaims.push({ kind, id });
        }
      }
      const { data: openLegacyPrograms, error: legacyError } = await client
        .from('ijazah_programs')
        .select('*')
        .eq('eligibility_method', 'legacy_attendance')
        .eq('is_active', true);
      if (legacyError) throw legacyError;
      for (const prog of openLegacyPrograms || []) {
        if (entries.some((entry) => entry.program.id === prog.id)) continue;
        const availability = programAvailability(prog);
        const offeredTypes = offeredDocumentTypes(prog, 'male');
        if (!availability.available || offeredTypes.length === 0) continue;
        entries.push({
          claim_kind: 'open_program',
          claim_id: `program:${prog.id}`,
          program: safeProgram(prog),
          availability,
          full_name: '',
          gender: null,
          eligible_document_types: offeredTypes,
          request: null,
          documents: [],
          revoked: false,
          revoked_reason: null,
          visible: true,
        });
      }
      entries.sort((left, right) => String(left.program.title).localeCompare(String(right.program.title), 'ar'));
      return jsonResponse({
        entries,
        invalid_claims: invalidClaims,
        has_visible_items: entries.some((entry) => entry.visible),
      });
    }

    if (action === 'claim_exam_submission') {
      const submissionId = typeof body.submission_id === 'string' ? body.submission_id : '';
      if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error('نتيجة الاختبار غير صالحة.');
      const { data: examSubmission, error: submissionError } = await client
        .from('shmoury_submissions')
        .select('id, exam_id, student_name, status')
        .eq('id', submissionId)
        .maybeSingle();
      if (submissionError) throw submissionError;
      if (!examSubmission || examSubmission.status !== 'passed') throw new Error('لا توجد نتيجة ناجحة مؤهلة لهذه الدورة.');
      const { data: exam, error: examError } = await client
        .from('shmoury_exams')
        .select('id, dawra_id')
        .eq('id', examSubmission.exam_id)
        .single();
      if (examError) throw examError;
      const { data: programs, error: programsError } = await client
        .from('ijazah_programs')
        .select('*')
        .eq('dawra_id', exam.dawra_id)
        .eq('eligibility_method', 'passed_exam');
      if (programsError) throw programsError;

      const claims: Array<{ kind: 'entitlement'; id: string; token: string; program_slug: string }> = [];
      for (const program of programs || []) {
        let { data: entitlement, error: entitlementError } = await client
          .from('ijazah_entitlements')
          .select('*')
          .eq('program_id', program.id)
          .eq('source_type', 'exam_submission')
          .eq('source_id', examSubmission.id)
          .maybeSingle();
        if (entitlementError) throw entitlementError;
        if (!entitlement) {
          const id = crypto.randomUUID();
          const token = await createParticipantToken(`entitlement:${id}`);
          const { data: inserted, error: insertError } = await client
            .from('ijazah_entitlements')
            .insert({
              id,
              program_id: program.id,
              source_type: 'exam_submission',
              source_id: examSubmission.id,
              full_name: cleanParticipantName(examSubmission.student_name),
              certificate_eligible: program.offers_certificate !== false,
              ijazah_eligible: program.offers_ijazah !== false,
              access_token_hash: await sha256Hex(token),
            })
            .select('*')
            .single();
          if (insertError) {
            if (insertError.code !== '23505') throw insertError;
            const { data: raced, error: raceError } = await client
              .from('ijazah_entitlements')
              .select('*')
              .eq('program_id', program.id)
              .eq('source_type', 'exam_submission')
              .eq('source_id', examSubmission.id)
              .single();
            if (raceError) throw raceError;
            entitlement = raced;
          } else {
            entitlement = inserted;
          }
        }
        if (entitlement.revoked_at) continue;
        claims.push({
          kind: 'entitlement',
          id: entitlement.id,
          token: await createParticipantToken(`entitlement:${entitlement.id}`),
          program_slug: program.slug,
        });
      }
      return jsonResponse({ claims });
    }

    if (action === 'request_entitlement') {
      const entitlement = await findAuthorizedEntitlement(client, body.entitlement_id, body.access_token);
      const program = await getProgram(client, entitlement.program_id);
      assertProgramAvailable(program);
      const fullName = cleanParticipantName(body.full_name || entitlement.full_name);
      const gender = body.gender === 'male' || body.gender === 'female'
        ? body.gender
        : entitlement.gender === 'male' || entitlement.gender === 'female'
        ? entitlement.gender
        : null;
      if (!gender) throw new Error('يرجى اختيار الجنس لاعتماد صيغة المستند.');
      if (body.acknowledged !== true) throw new Error('يجب تأكيد صحة الاسم قبل الإرسال.');

      const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
      const accessHash = await sha256Hex(accessToken);
      const idempotencyHash = await sha256Hex(`entitlement-request:${entitlement.id}`);
      const certificateEligible = entitlement.certificate_eligible && program.offers_certificate !== false;
      const ijazahEligible = entitlement.ijazah_eligible && program.offers_ijazah !== false;
      if (!certificateEligible && !ijazahEligible) throw new Error('لا توجد مستندات مؤهلة متاحة لهذا الطلب.');
      const requiresApproval = Boolean(program.requires_approval);

      let { data: submission, error: existingError } = await client
        .from('ghawthani_submissions')
        .select('*')
        .eq('entitlement_id', entitlement.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!submission) {
        const { data: inserted, error: insertError } = await client
          .from('ghawthani_submissions')
          .insert({
            program_id: program.id,
            entitlement_id: entitlement.id,
            full_name: fullName,
            gender,
            attended_day_1: certificateEligible || ijazahEligible,
            attended_day_2: ijazahEligible,
            attended_day_3: ijazahEligible,
            certificate_eligible: certificateEligible,
            ijazah_eligible: ijazahEligible,
            eligibility_source: program.eligibility_method,
            approval_status: requiresApproval ? 'pending_approval' : 'approved',
            approved_at: requiresApproval ? null : new Date().toISOString(),
            acknowledged: true,
            idempotency_key_hash: idempotencyHash,
            access_token_hash: accessHash,
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        submission = inserted;
        const { error: entitlementUpdateError } = await client.from('ijazah_entitlements').update({ full_name: fullName, gender }).eq('id', entitlement.id);
        if (entitlementUpdateError) throw entitlementUpdateError;
      } else {
        if (submission.access_token_hash !== accessHash) throw new Error('تعذر استعادة الطلب السابق بأمان.');
        if (submission.revoked_at) throw new Error('تم إلغاء صلاحية هذا الطلب من الإدارة.');
        if (submission.approval_status === 'rejected') throw new Error('تم رفض هذا الطلب من الإدارة ولا يمكن إعادة إرساله.');
        if (submission.generation_status !== 'completed') {
          const { data: updatedSub, error: updateSubError } = await client
            .from('ghawthani_submissions')
            .update({
              full_name: fullName,
              gender,
              attended_day_1: certificateEligible || ijazahEligible,
              attended_day_2: ijazahEligible,
              attended_day_3: ijazahEligible,
              certificate_eligible: certificateEligible,
              ijazah_eligible: ijazahEligible,
            })
            .eq('id', submission.id)
            .select('*')
            .single();
          if (updateSubError) throw updateSubError;
          submission = updatedSub;
          await client.from('ijazah_entitlements').update({ full_name: fullName, gender }).eq('id', entitlement.id);
        }
      }
      if ((submission.approval_status || 'approved') === 'approved' && !['completed', 'not_required'].includes(submission.generation_status)) {
        try {
          await issueSubmissionDocuments(client, submission);
        } catch {
          // The durable request and generation failure are returned below.
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
        documents: await signedDocuments(client, refreshed.id),
      });
    }

    if (action === 'retry_submission') {
      let submission = await findAuthorizedSubmission(client, body.submission_id, body.access_token);
      const program = await getProgram(client, submission.program_id);
      assertProgramAvailable(program);
      if (submission.approval_status === 'pending_approval') {
        throw new Error('الطلب بانتظار موافقة الإدارة قبل إصدار المستندات.');
      }
      if (submission.approval_status === 'rejected') {
        throw new Error('تم رفض هذا الطلب من الإدارة.');
      }
      if (typeof body.full_name === 'string' && body.full_name.trim() && submission.generation_status !== 'completed') {
        const cleanedName = cleanParticipantName(body.full_name);
        const { data: updated, error: updateError } = await client
          .from('ghawthani_submissions')
          .update({ full_name: cleanedName })
          .eq('id', submission.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        submission = updated;
      }
      if (!['completed', 'not_required'].includes(submission.generation_status)) {
        try {
          await issueSubmissionDocuments(client, submission);
        } catch {
          // Return durable error state on submission below.
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
        documents: await signedDocuments(client, refreshed.id),
      });
    }

    if (action === 'program') {
      const slug = typeof body.program_slug === 'string' ? body.program_slug.trim().toLowerCase() : 'ghawthani';
      const { data, error } = await client.from('ijazah_programs')
        .select('*')
        .eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!data || data.eligibility_method !== 'legacy_attendance') throw new Error('برنامج الإجازات والشهادات المطلوب غير متاح.');
      return jsonResponse({
        program: safeProgram(data),
        availability: programAvailability(data),
      });
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
      .select('*').eq('slug', programSlug).maybeSingle();
    if (programError) throw programError;
    if (!program || program.eligibility_method !== 'legacy_attendance') throw new Error('برنامج الإجازات والشهادات المطلوب غير متاح.');
    assertProgramAvailable(program);

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
    const attendanceCount = Number(day1) + Number(day2) + Number(day3);
    const certificateEligible = attendanceCount > 0 && program.offers_certificate !== false;
    const ijazahEligible = attendanceCount === 3 && program.offers_ijazah !== false;
    const hasEligibleDocs = certificateEligible || ijazahEligible;
    const requiresApproval = Boolean(program.requires_approval) && hasEligibleDocs;
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
          certificate_eligible: certificateEligible,
          ijazah_eligible: ijazahEligible,
          acknowledged: true,
          idempotency_key_hash: idempotencyHash,
          access_token_hash: accessHash,
          eligibility_source: 'legacy_attendance',
          approval_status: requiresApproval ? 'pending_approval' : 'approved',
          approved_at: requiresApproval ? null : new Date().toISOString(),
          generation_status: hasEligibleDocs ? 'pending' : 'not_required',
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
    if (submission.revoked_at) throw new Error('تم إلغاء صلاحية هذا الطلب من الإدارة.');
    if ((submission.approval_status || 'approved') === 'approved' && !['completed', 'not_required'].includes(submission.generation_status)) {
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
