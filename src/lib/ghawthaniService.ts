import { requireSupabase } from './supabase';

export type GhawthaniGender = 'male' | 'female';
export type GhawthaniEligibility = 'none' | 'certificate_only' | 'ijazah_and_certificate';
export type GhawthaniGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_required';
export type GhawthaniDocumentType = 'ijazah_male' | 'ijazah_female' | 'participation_certificate';
export type GhawthaniFontFamily = 'noto_naskh' | 'amiri' | 'aref_ruqaa';

export interface GhawthaniDocument {
  id: string;
  document_type: GhawthaniDocumentType;
  template_version_id: string;
  generation_status: 'processing' | 'issued' | 'failed';
  generation_error?: string | null;
  issued_at: string | null;
  download_url?: string;
}

export interface GhawthaniSubmission {
  id: string;
  program_id: string;
  full_name: string;
  gender: GhawthaniGender;
  attended_day_1: boolean;
  attended_day_2: boolean;
  attended_day_3: boolean;
  attendance_count: number;
  eligibility: GhawthaniEligibility;
  entitlement_id?: string | null;
  certificate_eligible?: boolean | null;
  ijazah_eligible?: boolean | null;
  eligibility_source?: 'legacy_attendance' | 'passed_exam' | 'manual';
  approval_status?: 'pending_approval' | 'approved' | 'rejected';
  approved_at?: string | null;
  approval_note?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  generation_status: GhawthaniGenerationStatus;
  generation_error: string | null;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  submitted_at: string;
  updated_at?: string;
  documents?: GhawthaniDocument[];
}

export interface GhawthaniTemplate {
  id: string;
  program_id: string;
  version_number: number;
  template_type: GhawthaniDocumentType;
  original_filename: string;
  page_count: number;
  page_index: number;
  page_width: number;
  page_height: number;
  name_x: number;
  name_y: number;
  name_width: number;
  name_height: number;
  font_size: number;
  min_font_size: number;
  font_color: string;
  font_family: GhawthaniFontFamily;
  alignment: 'center' | 'right' | 'left';
  is_validated: boolean;
  is_active: boolean;
  validated_at: string | null;
  activated_at: string | null;
  created_at: string;
  preview_url?: string;
}

export interface GhawthaniSummary {
  submissions: number;
  ijazah_eligible: number;
  certificate_only: number;
  generation_failures: number;
  eligible_participants?: number;
  issued_documents?: number;
  pending_approvals?: number;
  revoked_count?: number;
}

export type IjazahEligibilityMethod = 'legacy_attendance' | 'passed_exam' | 'manual';

export interface IjazahProgram {
  id: string;
  dawra_id: string | null;
  slug: string;
  title: string;
  course_subject: string;
  instructor_name: string;
  introduction: string;
  trust_statement: string;
  is_active: boolean;
  offers_certificate: boolean;
  offers_ijazah: boolean;
  eligibility_method: IjazahEligibilityMethod;
  requires_approval?: boolean;
  available_from: string | null;
  available_until: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParticipantClaim {
  kind: 'submission' | 'entitlement';
  id: string;
  token: string;
  program_slug?: string;
}

export interface ProgramAvailability {
  available: boolean;
  state: 'inactive' | 'scheduled' | 'expired' | 'available';
  available_from: string | null;
  available_until: string | null;
}

export interface ParticipantPortfolioEntry {
  claim_kind: ParticipantClaim['kind'] | 'open_program';
  claim_id: string;
  program: IjazahProgram;
  availability: ProgramAvailability;
  full_name: string;
  gender: GhawthaniGender | null;
  eligible_document_types: GhawthaniDocumentType[];
  request: GhawthaniSubmission | null;
  documents: GhawthaniDocument[];
  revoked?: boolean;
  revoked_reason?: string | null;
  visible: boolean;
}

export interface IjazahEntitlement {
  id: string;
  program_id: string;
  source_type: 'exam_submission' | 'manual';
  source_id: string | null;
  full_name: string;
  gender: GhawthaniGender | null;
  certificate_eligible: boolean;
  ijazah_eligible: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  request?: GhawthaniSubmission | null;
}

async function functionError(error: any) {
  try {
    const response = error?.context as Response | undefined;
    if (response) {
      const payload = await response.clone().json();
      if (payload?.error) return new Error(payload.error);
    }
  } catch {
    // Fall back to the SDK message.
  }
  return new Error(error?.message || 'تعذر الاتصال بالخدمة.');
}

async function invoke<T>(functionName: string, body: Record<string, unknown>, adminToken?: string): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke(functionName, {
    body,
    headers: adminToken ? { 'x-ghawthani-admin': adminToken } : undefined,
  });
  if (error) throw await functionError(error);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function submitGhawthani(input: {
  program_slug?: string;
  full_name: string;
  gender: GhawthaniGender;
  attended_day_1: boolean;
  attended_day_2: boolean;
  attended_day_3: boolean;
  acknowledged: true;
  idempotency_key: string;
}) {
  return invoke<{ submission: GhawthaniSubmission; access_token: string; documents: GhawthaniDocument[] }>('ghawthani', { action: 'submit', ...input });
}

export async function getIjazahProgram(programSlug = 'ghawthani') {
  return invoke<{ program: IjazahProgram; availability?: ProgramAvailability }>('ghawthani', { action: 'program', program_slug: programSlug });
}

export async function getGhawthaniStatus(submissionId: string, accessToken: string) {
  return invoke<{ submission: GhawthaniSubmission; documents: GhawthaniDocument[] }>('ghawthani', {
    action: 'status', submission_id: submissionId, access_token: accessToken,
  });
}

export async function retryGhawthaniSubmission(input: {
  submission_id: string;
  access_token: string;
  full_name?: string;
}) {
  return invoke<{ submission: GhawthaniSubmission; documents: GhawthaniDocument[] }>('ghawthani', {
    action: 'retry_submission', ...input,
  });
}

export async function getParticipantPortfolio(claims = loadParticipantClaims()) {
  return invoke<{
    entries: ParticipantPortfolioEntry[];
    invalid_claims: Array<{ kind: ParticipantClaim['kind']; id: string }>;
    has_visible_items: boolean;
  }>('ghawthani', { action: 'portfolio', claims });
}

export async function claimPassedExam(submissionId: string) {
  const result = await invoke<{ claims: ParticipantClaim[] }>('ghawthani', {
    action: 'claim_exam_submission', submission_id: submissionId,
  });
  for (const claim of result.claims) addParticipantClaim(claim);
  return result;
}

export async function requestEntitlement(input: {
  entitlement_id: string;
  access_token: string;
  full_name: string;
  gender: GhawthaniGender;
  acknowledged: true;
}) {
  return invoke<{ submission: GhawthaniSubmission; documents: GhawthaniDocument[] }>('ghawthani', {
    action: 'request_entitlement', ...input,
  });
}

export async function loginGhawthaniAdmin(code: string) {
  return invoke<{ token: string; expires_in: number }>('ghawthani-admin', { action: 'login', code });
}

export async function ghawthaniAdmin<T>(token: string, action: string, input: Record<string, unknown> = {}) {
  return invoke<T>('ghawthani-admin', { action, ...input }, token);
}

export async function fileAsBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.readAsDataURL(file);
  });
}

export const GH_ADMIN_TOKEN_KEY = 'shmoury_ghawthani_admin_token';
export const GH_PARTICIPANT_SESSION_KEY = 'shmoury_ghawthani_participant';
export const IJAZAH_CLAIMS_KEY = 'shmoury_ijazah_claims_v1';
export const IJAZAH_CLAIMS_CHANGED = 'shmoury:ijazah-claims-changed';

export function computeProgramAvailability(
  program: Pick<IjazahProgram, 'is_active' | 'available_from' | 'available_until'>,
  now = new Date(),
): ProgramAvailability {
  const nowMs = now.getTime();
  const startMs = program.available_from ? new Date(program.available_from).getTime() : null;
  const endMs = program.available_until ? new Date(program.available_until).getTime() : null;
  const startsLater = startMs !== null && Number.isFinite(startMs) && nowMs < startMs;
  const expired = endMs !== null && Number.isFinite(endMs) && nowMs >= endMs;
  const available = program.is_active !== false && !startsLater && !expired;
  return {
    available,
    state: program.is_active === false
      ? 'inactive'
      : startsLater
        ? 'scheduled'
        : expired
          ? 'expired'
          : 'available',
    available_from: program.available_from || null,
    available_until: program.available_until || null,
  };
}

export function saveLegacyProgramSession(programSlug: string, submissionId: string, accessToken: string) {
  const payload = JSON.stringify({
    submissionId,
    accessToken,
    savedProgramSlug: programSlug,
  });
  sessionStorage.setItem(`${GH_PARTICIPANT_SESSION_KEY}:${programSlug}`, payload);
  if (programSlug === 'ghawthani') {
    sessionStorage.setItem(GH_PARTICIPANT_SESSION_KEY, payload);
  }
}

export function loadLegacyProgramSession(programSlug: string): { submissionId: string; accessToken: string; savedProgramSlug: string } | null {
  try {
    const scoped = sessionStorage.getItem(`${GH_PARTICIPANT_SESSION_KEY}:${programSlug}`);
    if (scoped) {
      const parsed = JSON.parse(scoped);
      if (parsed?.submissionId && parsed?.accessToken) return parsed;
    }
    const legacy = sessionStorage.getItem(GH_PARTICIPANT_SESSION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const savedSlug = parsed?.savedProgramSlug || 'ghawthani';
      if (parsed?.submissionId && parsed?.accessToken && savedSlug === programSlug) {
        return { ...parsed, savedProgramSlug: savedSlug };
      }
    }
    const claim = loadParticipantClaims().find(
      (item) => item.kind === 'submission' && (item.program_slug || 'ghawthani') === programSlug,
    );
    if (claim) {
      return { submissionId: claim.id, accessToken: claim.token, savedProgramSlug: programSlug };
    }
  } catch {
    // Ignore storage parsing errors.
  }
  return null;
}

export function clearLegacyProgramSession(programSlug: string) {
  sessionStorage.removeItem(`${GH_PARTICIPANT_SESSION_KEY}:${programSlug}`);
  try {
    const legacy = sessionStorage.getItem(GH_PARTICIPANT_SESSION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if ((parsed?.savedProgramSlug || 'ghawthani') === programSlug) {
        sessionStorage.removeItem(GH_PARTICIPANT_SESSION_KEY);
      }
    }
  } catch {
    sessionStorage.removeItem(GH_PARTICIPANT_SESSION_KEY);
  }
}

export function loadParticipantClaims(): ParticipantClaim[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(IJAZAH_CLAIMS_KEY) || '[]');
    const claims: ParticipantClaim[] = Array.isArray(parsed)
      ? parsed.filter((item): item is ParticipantClaim => Boolean(
        item && (item.kind === 'submission' || item.kind === 'entitlement')
        && typeof item.id === 'string' && typeof item.token === 'string',
      ))
      : [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (!key || (key !== GH_PARTICIPANT_SESSION_KEY && !key.startsWith(`${GH_PARTICIPANT_SESSION_KEY}:`))) continue;
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || '');
        if (saved?.submissionId && saved?.accessToken) {
          claims.push({
            kind: 'submission',
            id: saved.submissionId,
            token: saved.accessToken,
            program_slug: saved.savedProgramSlug || (key.includes(':') ? key.split(':').slice(1).join(':') : 'ghawthani'),
          });
        }
      } catch {
        // Ignore invalid session item.
      }
    }
    return [...new Map(claims.map((claim) => [`${claim.kind}:${claim.id}`, claim])).values()];
  } catch {
    return [];
  }
}

export function addParticipantClaim(claim: ParticipantClaim) {
  const claims = loadParticipantClaims().filter((item) => !(item.kind === claim.kind && item.id === claim.id));
  claims.push(claim);
  localStorage.setItem(IJAZAH_CLAIMS_KEY, JSON.stringify(claims));
  window.dispatchEvent(new CustomEvent(IJAZAH_CLAIMS_CHANGED));
}

export function removeParticipantClaims(invalid: Array<{ kind: ParticipantClaim['kind']; id: string }>) {
  if (!invalid.length) return;
  const bad = new Set(invalid.map((claim) => `${claim.kind}:${claim.id}`));
  const claims = loadParticipantClaims().filter((claim) => !bad.has(`${claim.kind}:${claim.id}`));
  localStorage.setItem(IJAZAH_CLAIMS_KEY, JSON.stringify(claims));
  window.dispatchEvent(new CustomEvent(IJAZAH_CLAIMS_CHANGED));
}

export const documentLabels: Record<GhawthaniDocumentType, string> = {
  ijazah_male: 'الإجازة',
  ijazah_female: 'الإجازة',
  participation_certificate: 'شهادة المشاركة والحضور',
};
