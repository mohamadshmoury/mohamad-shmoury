import type { AnswerDetail, Exam, Question } from '../types';

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ');
}

export function getCorrectAnswerLabel(question: Question) {
  if (question.type === 'short_answer') {
    return question.correct_answer.values?.join(' / ') || '';
  }

  if (question.type === 'true_false') {
    return question.correct_answer.value === 'true' ? 'صح' : 'خطأ';
  }

  return question.correct_answer.value || '';
}

export function isAnswerCorrect(question: Question, rawAnswer: string | undefined) {
  const answer = rawAnswer || '';
  if (!answer.trim()) return false;

  if (question.type === 'short_answer') {
    const accepted = question.correct_answer.values || [];
    return accepted.some((value) => normalizeText(value) === normalizeText(answer));
  }

  return answer === question.correct_answer.value;
}

export function scoreExam(exam: Exam, questions: Question[], answers: Record<string, string>) {
  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points || 1), 0);
  let earned = 0;

  const details: AnswerDetail[] = questions.map((question) => {
    const answer = answers[question.id] || '';
    const correct = isAnswerCorrect(question, answer);
    const pointsPossible = Number(question.points || 1);
    const pointsAwarded = correct ? pointsPossible : 0;
    earned += pointsAwarded;

    return {
      question_id: question.id,
      prompt: question.prompt,
      type: question.type,
      answer,
      correct_answer: getCorrectAnswerLabel(question),
      is_correct: correct,
      points_awarded: pointsAwarded,
      points_possible: pointsPossible,
    };
  });

  const percentage = totalPoints > 0 ? Number(((earned / totalPoints) * 100).toFixed(2)) : 0;

  return {
    score: earned,
    totalPoints,
    percentage,
    status: percentage >= exam.passing_score ? ('passed' as const) : ('failed' as const),
    details,
  };
}
