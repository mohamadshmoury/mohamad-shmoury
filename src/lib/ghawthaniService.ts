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
}

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
  created_at?: string;
  updated_at?: string;
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
  return invoke<{ program: IjazahProgram }>('ghawthani', { action: 'program', program_slug: programSlug });
}

export async function getGhawthaniStatus(submissionId: string, accessToken: string) {
  return invoke<{ submission: GhawthaniSubmission; documents: GhawthaniDocument[] }>('ghawthani', {
    action: 'status', submission_id: submissionId, access_token: accessToken,
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

export const documentLabels: Record<GhawthaniDocumentType, string> = {
  ijazah_male: 'الإجازة',
  ijazah_female: 'الإجازة',
  participation_certificate: 'شهادة المشاركة والحضور',
};
