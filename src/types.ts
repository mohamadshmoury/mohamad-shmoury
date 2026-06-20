export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type ExamStatus = 'passed' | 'failed';

export type CourseMaterialKind = 'file' | 'link';

export interface CourseAttachment {
  id?: string;
  name: string;
  url: string;
  kind?: CourseMaterialKind;
  week?: string;
}

export type CourseStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'archived';

export interface SheikhProfile {
  id: number;
  bio: string | null;
  avatar_url: string | null;
  updated_at?: string;
}

export interface Dawra {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  sheikh_intro: string | null;
  starts_on: string | null;
  status: CourseStatus;
  theme_color: string | null;
  duration: string | null;
  attachments: CourseAttachment[] | null;
  created_at?: string;
}

export interface CorrectAnswer {
  value?: string;
  values?: string[];
}

export interface Question {
  id: string;
  exam_id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  correct_answer: CorrectAnswer;
  points: number;
  sort_order: number;
  explanation: string | null;
  created_at?: string;
}

export interface Exam {
  id: string;
  dawra_id: string;
  title: string;
  description: string | null;
  access_code: string | null;
  passing_score: number;
  allow_multiple_attempts: boolean;
  is_published: boolean;
  show_results_immediately: boolean;
  created_at?: string;
  dawra?: Dawra | null;
  questions?: Question[];
}

export interface AnswerDetail {
  question_id: string;
  prompt: string;
  type: QuestionType;
  answer: string;
  correct_answer: string;
  is_correct: boolean;
  points_awarded: number;
  points_possible: number;
}

export interface Submission {
  id?: string;
  exam_id: string;
  student_name: string;
  phone: string;
  email: string | null;
  score: number;
  percentage: number;
  status: ExamStatus;
  answers: AnswerDetail[];
  started_at: string;
  submitted_at: string;
  duration_seconds: number;
  reviewed?: boolean;
  admin_notes?: string | null;
}
