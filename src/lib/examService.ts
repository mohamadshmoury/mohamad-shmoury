import type {
  CorrectAnswer,
  CourseAttachment,
  CourseStatus,
  Dawra,
  Exam,
  Question,
  QuestionType,
  Submission,
  SheikhProfile,
} from '../types';
import { createExamSlug } from './examLinks';
import { requireSupabase } from './supabase';

const DAWRAT_TABLE = 'shmoury_dawrat';
const EXAMS_TABLE = 'shmoury_exams';
const QUESTIONS_TABLE = 'shmoury_questions';
const SUBMISSIONS_TABLE = 'shmoury_submissions';
const PROFILE_TABLE = 'shmoury_profile';
const STORAGE_BUCKET = 'shmoury-assets';

function slugifyFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  const rawBase = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : '';
  const safeBase = rawBase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${safeBase || 'file'}${extension}`;
}

function uniqueStoragePath(folder: string, fileName: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${folder}/${stamp}-${slugifyFileName(fileName)}`;
}

export async function uploadPublicAsset(file: File, folder: 'course-files' | 'profile-images') {
  const client = requireSupabase();
  const path = uniqueStoragePath(folder, file.name);
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) throw error;

  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function normalizeQuestion(row: any): Question {
  return {
    id: row.id,
    exam_id: row.exam_id,
    prompt: row.prompt,
    type: row.type,
    options: Array.isArray(row.options) ? row.options : [],
    correct_answer: row.correct_answer || {},
    points: Number(row.points || 1),
    sort_order: Number(row.sort_order || 0),
    explanation: row.explanation || null,
    created_at: row.created_at,
  };
}

function normalizeCourseAttachments(value: unknown): CourseAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];

    const attachment = item as Record<string, unknown>;
    const name = typeof attachment.name === 'string' ? attachment.name.trim() : '';
    const url = typeof attachment.url === 'string' ? attachment.url.trim() : '';
    if (!name || !url) return [];

    return [{
      id: typeof attachment.id === 'string' && attachment.id
        ? attachment.id
        : `legacy-${index}-${url}`,
      name,
      url,
      kind: attachment.kind === 'link' ? 'link' : 'file',
      week: typeof attachment.week === 'string' ? attachment.week.trim() : '',
    }];
  });
}

function normalizeDawra(row: any): Dawra {
  const status = (row.status === 'active' ? 'in_progress' : row.status || 'draft') as CourseStatus;

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || null,
    description: row.description || null,
    sheikh_intro: row.sheikh_intro || null,
    starts_on: row.starts_on || null,
    status,
    theme_color: row.theme_color || null,
    duration: row.duration || null,
    attachments: normalizeCourseAttachments(row.attachments),
    created_at: row.created_at,
  };
}

function normalizeExam(row: any): Exam {
  return {
    id: row.id,
    dawra_id: row.dawra_id,
    title: row.title,
    description: row.description || null,
    access_code: row.access_code || null,
    passing_score: Number(row.passing_score || 70),
    allow_multiple_attempts: Boolean(row.allow_multiple_attempts),
    is_published: Boolean(row.is_published),
    show_results_immediately: row.show_results_immediately !== false,
    ends_at: row.ends_at || null,
    show_answers_after_end: Boolean(row.show_answers_after_end),
    created_at: row.created_at,
    dawra: row.dawra || row.shmoury_dawrat || null,
  };
}

export async function getAllDawrat() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(DAWRAT_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeDawra);
}

export async function getPublishedExams() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(EXAMS_TABLE)
    .select('*, dawra:shmoury_dawrat(*)')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeExam);
}

export async function getAllExams() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(EXAMS_TABLE)
    .select('*, dawra:shmoury_dawrat(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeExam);
}

export async function getExamWithQuestions(examId: string) {
  const client = requireSupabase();
  const { data: examRow, error: examError } = await client
    .from(EXAMS_TABLE)
    .select('*, dawra:shmoury_dawrat(*)')
    .eq('id', examId)
    .single();

  if (examError) throw examError;

  const { data: questionRows, error: questionsError } = await client
    .from(QUESTIONS_TABLE)
    .select('*')
    .eq('exam_id', examId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (questionsError) throw questionsError;

  return {
    ...normalizeExam(examRow),
    questions: (questionRows || []).map(normalizeQuestion),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getPublishedExamWithQuestions(examReference: string) {
  const client = requireSupabase();
  let exam: Exam;

  if (isUuid(examReference)) {
    const { data: examRow, error: examError } = await client
      .from(EXAMS_TABLE)
      .select('*, dawra:shmoury_dawrat(*)')
      .eq('id', examReference)
      .eq('is_published', true)
      .single();

    if (examError) throw examError;
    exam = normalizeExam(examRow);
  } else {
    const matches = (await getPublishedExams()).filter(
      (candidate) => createExamSlug(candidate.title) === examReference,
    );

    if (matches.length === 0) {
      throw new Error('الاختبار غير موجود أو غير منشور.');
    }
    if (matches.length > 1) {
      throw new Error('يوجد أكثر من اختبار يحمل الاسم نفسه.');
    }
    exam = matches[0];
  }

  const { data: questionRows, error: questionsError } = await client
    .from(QUESTIONS_TABLE)
    .select('*')
    .eq('exam_id', exam.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (questionsError) throw questionsError;

  return {
    ...exam,
    questions: (questionRows || []).map(normalizeQuestion),
  };
}

export async function createDawraAndExam(input: {
  dawraTitle: string;
  dawraSubtitle: string;
  dawraDescription: string;
  sheikhIntro: string;
  examTitle: string;
  examDescription: string;
  accessCode: string;
  passingScore: number;
  isPublished: boolean;
}) {
  const client = requireSupabase();
  const { data: dawra, error: dawraError } = await client
    .from(DAWRAT_TABLE)
    .insert({
      title: input.dawraTitle,
      subtitle: input.dawraSubtitle || null,
      description: input.dawraDescription || null,
      sheikh_intro: input.sheikhIntro || null,
      status: input.isPublished ? 'in_progress' : 'draft',
      theme_color: '#0f766e',
    })
    .select('*')
    .single();

  if (dawraError) throw dawraError;

  const { data: exam, error: examError } = await client
    .from(EXAMS_TABLE)
    .insert({
      dawra_id: dawra.id,
      title: input.examTitle,
      description: input.examDescription || null,
      access_code: input.accessCode || null,
      passing_score: input.passingScore,
      is_published: input.isPublished,
      allow_multiple_attempts: false,
    })
    .select('*, dawra:shmoury_dawrat(*)')
    .single();

  if (examError) throw examError;
  return normalizeExam(exam);
}

export async function getSheikhProfile(): Promise<SheikhProfile> {
  const client = requireSupabase();
  try {
    const { data, error } = await client
      .from(PROFILE_TABLE)
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase profile error, using localStorage fallback:', err);
    const localBio = localStorage.getItem('shmoury_profile_bio') || 'مرحباً بكم في المنصة الرسمية لدروس ودورات الشيخ محمد أحمد الشموري.';
    const localAvatar = localStorage.getItem('shmoury_profile_avatar_url') || '';
    return { id: 1, bio: localBio, avatar_url: localAvatar };
  }
}

export async function updateSheikhProfile(bio: string, avatarUrl: string): Promise<SheikhProfile> {
  localStorage.setItem('shmoury_profile_bio', bio);
  localStorage.setItem('shmoury_profile_avatar_url', avatarUrl);
  const client = requireSupabase();
  try {
    const { data, error } = await client
      .from(PROFILE_TABLE)
      .upsert({ id: 1, bio, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Failed to upsert profile in Supabase, using localStorage:', err);
    return { id: 1, bio, avatar_url: avatarUrl };
  }
}

export async function createDawra(input: {
  title: string;
  subtitle: string;
  description: string;
  sheikhIntro: string;
  status: CourseStatus;
  duration: string;
  startsOn: string;
  attachments: CourseAttachment[];
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(DAWRAT_TABLE)
    .insert({
      title: input.title,
      subtitle: input.subtitle || null,
      description: input.description || null,
      sheikh_intro: input.sheikhIntro || null,
      status: input.status,
      theme_color: '#0f766e',
      duration: input.duration || null,
      starts_on: input.startsOn || null,
      attachments: input.attachments || [],
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeDawra(data);
}

export async function updateDawra(id: string, input: {
  title: string;
  subtitle: string;
  description: string;
  sheikhIntro: string;
  status: CourseStatus;
  duration: string;
  startsOn: string;
  attachments: CourseAttachment[];
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(DAWRAT_TABLE)
    .update({
      title: input.title,
      subtitle: input.subtitle || null,
      description: input.description || null,
      sheikh_intro: input.sheikhIntro || null,
      status: input.status,
      duration: input.duration || null,
      starts_on: input.startsOn || null,
      attachments: input.attachments || [],
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeDawra(data);
}

export async function createExamForDawra(input: {
  dawraId: string;
  title: string;
  description: string;
  accessCode: string;
  passingScore: number;
  isPublished: boolean;
  showResultsImmediately: boolean;
  endsAt: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(EXAMS_TABLE)
    .insert({
      dawra_id: input.dawraId,
      title: input.title,
      description: input.description || null,
      access_code: input.accessCode || null,
      passing_score: input.passingScore,
      is_published: input.isPublished,
      show_results_immediately: input.showResultsImmediately,
      ends_at: input.endsAt,
      show_answers_after_end: false,
      allow_multiple_attempts: false,
    })
    .select('*, dawra:shmoury_dawrat(*)')
    .single();

  if (error) throw error;
  return normalizeExam(data);
}

export async function updateExamSettings(examId: string, input: {
  title?: string;
  description?: string;
  accessCode?: string;
  passingScore?: number;
  isPublished?: boolean;
  showResultsImmediately?: boolean;
  endsAt?: string | null;
  showAnswersAfterEnd?: boolean;
}) {
  const client = requireSupabase();
  const updates: any = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.accessCode !== undefined) updates.access_code = input.accessCode;
  if (input.passingScore !== undefined) updates.passing_score = input.passingScore;
  if (input.isPublished !== undefined) updates.is_published = input.isPublished;
  if (input.showResultsImmediately !== undefined) updates.show_results_immediately = input.showResultsImmediately;
  if (input.endsAt !== undefined) updates.ends_at = input.endsAt;
  if (input.showAnswersAfterEnd !== undefined) updates.show_answers_after_end = input.showAnswersAfterEnd;

  const { data, error } = await client
    .from(EXAMS_TABLE)
    .update(updates)
    .eq('id', examId)
    .select('*, dawra:shmoury_dawrat(*)')
    .single();

  if (error) throw error;
  return normalizeExam(data);
}

export async function updateExamPublishState(examId: string, isPublished: boolean) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(EXAMS_TABLE)
    .update({ is_published: isPublished })
    .eq('id', examId)
    .select('*, dawra:shmoury_dawrat(*)')
    .single();

  if (error) throw error;
  return normalizeExam(data);
}

export async function getQuestions(examId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(QUESTIONS_TABLE)
    .select('*')
    .eq('exam_id', examId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeQuestion);
}

export async function createQuestion(input: {
  examId: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  correctAnswer: CorrectAnswer;
  points: number;
  sortOrder: number;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(QUESTIONS_TABLE)
    .insert({
      exam_id: input.examId,
      prompt: input.prompt,
      type: input.type,
      options: input.options,
      correct_answer: input.correctAnswer,
      points: input.points,
      sort_order: input.sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeQuestion(data);
}

export async function updateQuestion(questionId: string, input: {
  prompt: string;
  type: QuestionType;
  options: string[];
  correctAnswer: CorrectAnswer;
  points: number;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(QUESTIONS_TABLE)
    .update({
      prompt: input.prompt,
      type: input.type,
      options: input.options,
      correct_answer: input.correctAnswer,
      points: input.points,
    })
    .eq('id', questionId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeQuestion(data);
}

export async function deleteQuestion(questionId: string) {
  const client = requireSupabase();
  const { error } = await client.from(QUESTIONS_TABLE).delete().eq('id', questionId);
  if (error) throw error;
}

export async function checkExistingSubmission(examId: string, phone: string, email: string | null) {
  const client = requireSupabase();
  const { data: byPhone, error: phoneError } = await client
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('exam_id', examId)
    .eq('phone', phone)
    .limit(1);

  if (phoneError) throw phoneError;
  if (byPhone && byPhone.length > 0) return byPhone[0] as Submission;

  if (email) {
    const { data: byEmail, error: emailError } = await client
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .eq('exam_id', examId)
      .eq('email', email)
      .limit(1);

    if (emailError) throw emailError;
    if (byEmail && byEmail.length > 0) return byEmail[0] as Submission;
  }

  return null;
}

export async function createSubmission(payload: Submission) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(SUBMISSIONS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data as Submission;
}

export async function getSubmissions(examId?: string) {
  const client = requireSupabase();
  let query = client
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .order('submitted_at', { ascending: false });

  if (examId) {
    query = query.eq('exam_id', examId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as Submission[];
}

export async function updateSubmissionReview(id: string, adminNotes: string, reviewed: boolean) {
  const client = requireSupabase();
  const { data, error } = await client
    .from(SUBMISSIONS_TABLE)
    .update({ admin_notes: adminNotes, reviewed })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Submission;
}

export async function deleteDawra(dawraId: string) {
  const client = requireSupabase();
  const { error } = await client.from(DAWRAT_TABLE).delete().eq('id', dawraId);
  if (error) throw error;
}

export async function deleteExam(examId: string) {
  const client = requireSupabase();
  const { error } = await client.from(EXAMS_TABLE).delete().eq('id', examId);
  if (error) throw error;
}

export async function deleteSubmission(submissionId: string) {
  const client = requireSupabase();
  const { error } = await client.from(SUBMISSIONS_TABLE).delete().eq('id', submissionId);
  if (error) throw error;
}
