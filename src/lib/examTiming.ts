import type { Exam } from '../types';

export function isExamEnded(exam: Pick<Exam, 'ends_at'>, now = Date.now()) {
  if (!exam.ends_at) return false;
  const endTime = new Date(exam.ends_at).getTime();
  return Number.isFinite(endTime) && endTime <= now;
}

export function formatExamEndTime(value: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat('ar-LB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
