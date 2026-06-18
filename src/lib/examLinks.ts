import type { Exam } from '../types';

const EXAM_QUERY_PARAM = 'exam';
const EXAM_ID_QUERY_PARAM = 'id';

export function getExamReferenceFromUrl() {
  const params = new URL(window.location.href).searchParams;
  const explicitId = params.get(EXAM_ID_QUERY_PARAM)?.trim();
  if (explicitId) return explicitId;

  const examValue = params.get(EXAM_QUERY_PARAM)?.trim() || '';
  const separatorIndex = examValue.lastIndexOf('--');
  return separatorIndex >= 0 ? examValue.slice(separatorIndex + 2) : examValue;
}

export function createExamSlug(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'exam'
  );
}

export function getExamShareUrl(exam: Pick<Exam, 'title'>) {
  const url = new URL(window.location.href);
  url.searchParams.set(EXAM_QUERY_PARAM, createExamSlug(exam.title));
  url.searchParams.delete(EXAM_ID_QUERY_PARAM);
  url.hash = '';
  return decodeURI(url.toString());
}

export function getHomeUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(EXAM_QUERY_PARAM);
  url.searchParams.delete(EXAM_ID_QUERY_PARAM);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy method.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('تعذر نسخ الرابط.');
  }
}
