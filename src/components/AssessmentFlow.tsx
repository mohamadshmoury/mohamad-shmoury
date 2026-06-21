import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  Loader2,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkExistingSubmission, createSubmission, getExamWithQuestions } from '../lib/examService';
import { formatExamEndTime, isExamEnded } from '../lib/examTiming';
import { getCorrectAnswerLabel, scoreExam } from '../lib/scoring';
import type { Exam, Question, Submission } from '../types';

interface AssessmentFlowProps {
  examSummary: Exam;
  onBack: () => void;
}

type Stage = 'profile' | 'questions' | 'result';

interface StudentProfile {
  studentName: string;
  phone: string;
  email: string;
  accessCode: string;
}

const TRUE_FALSE_OPTIONS = [
  { value: 'true', label: 'صح' },
  { value: 'false', label: 'خطأ' },
];
const OPTION_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function isDemoExam(exam: Exam) {
  return exam.id.startsWith('demo-');
}

function orderQuestions(questions: Question[]) {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order);
}

function answerLabel(question: Question, answer: string) {
  if (!answer) return 'بدون إجابة';
  if (question.type === 'true_false') return answer === 'true' ? 'صح' : 'خطأ';
  return answer;
}

function ExamAnswerReview({ exam, questions }: { exam: Exam; questions: Question[] }) {
  return (
    <main className="content-band assessment-review-shell">
      <section className="tool-panel">
        <div className="section-heading compact">
          <span className="section-kicker">
            <Eye size={16} aria-hidden />
            انتهى الاختبار
          </span>
          <h2>{exam.title}</h2>
          <p>يمكنك الآن مراجعة أسئلة الاختبار وإجاباتها الصحيحة مباشرة.</p>
        </div>

        <div className="public-answer-review">
          {questions.map((question, index) => (
            <article className="public-answer-card" key={question.id}>
              <div className="public-answer-heading">
                <span className="question-number">{index + 1}</span>
                <div>
                  <small>
                    {question.type === 'multiple_choice'
                      ? 'اختيار من متعدد'
                      : question.type === 'true_false'
                        ? 'صح أو خطأ'
                        : 'إجابة قصيرة'}
                  </small>
                  <h3>{question.prompt}</h3>
                </div>
                <span>{question.points} نقطة</span>
              </div>

              {question.type === 'multiple_choice' && (
                <div className="public-review-options">
                  {question.options.map((option, optionIndex) => {
                    const correct = option === question.correct_answer.value;
                    return (
                      <div className={correct ? 'is-correct' : ''} key={option}>
                        {correct ? <CheckCircle2 size={17} aria-hidden /> : <Circle size={17} aria-hidden />}
                        <strong>{OPTION_LABELS[optionIndex] || optionIndex + 1}</strong>
                        <span>{option}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {question.type === 'true_false' && (
                <div className="public-review-options true-false">
                  {TRUE_FALSE_OPTIONS.map((option) => {
                    const correct = option.value === question.correct_answer.value;
                    return (
                      <div className={correct ? 'is-correct' : ''} key={option.value}>
                        {correct ? <CheckCircle2 size={17} aria-hidden /> : <Circle size={17} aria-hidden />}
                        <span>{option.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="public-correct-answer">
                <span>الإجابة الصحيحة:</span>
                <strong>{getCorrectAnswerLabel(question)}</strong>
              </div>
              {question.explanation && (
                <p className="public-answer-explanation">{question.explanation}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function AssessmentFlow({ examSummary, onBack }: AssessmentFlowProps) {
  const [exam, setExam] = useState<Exam>(examSummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [stage, setStage] = useState<Stage>('profile');
  const [profile, setProfile] = useState<StudentProfile>({
    studentName: '',
    phone: '',
    email: '',
    accessCode: '',
  });
  const [formError, setFormError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<Submission | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedAtRef = useRef<string>('');
  const autoSubmittedRef = useRef(false);

  const questions = useMemo(() => exam.questions || [], [exam.questions]);
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const examEnded = isExamEnded(exam, now);

  useEffect(() => {
    let mounted = true;

    async function loadExam() {
      setLoading(true);
      setLoadError('');
      try {
        if (examSummary.questions?.length) {
          if (!mounted) return;
          setExam({ ...examSummary, questions: orderQuestions(examSummary.questions) });
          return;
        }

        const freshExam = await getExamWithQuestions(examSummary.id);
        if (!mounted) return;
        setExam({ ...freshExam, questions: orderQuestions(freshExam.questions || []) });
      } catch (error) {
        if (!mounted) return;
        setLoadError(
          error instanceof Error ? error.message : 'تعذر تحميل أسئلة الاختبار.',
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadExam();
    return () => {
      mounted = false;
    };
  }, [examSummary]);

  useEffect(() => {
    if (!exam.ends_at) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [exam.ends_at]);

  function updateProfile(field: keyof StudentProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExamEnded(exam)) {
      setNow(Date.now());
      setFormError('انتهى موعد الاختبار ولم يعد من الممكن بدء محاولة جديدة.');
      return;
    }
    const name = profile.studentName.trim();
    const phone = profile.phone.trim();
    const email = profile.email.trim().toLowerCase();

    if (!name || !phone) {
      setFormError('الاسم ورقم الهاتف مطلوبان.');
      return;
    }

    if (!/^\+?[\d\s-]{7,20}$/.test(phone)) {
      setFormError('رقم الهاتف غير صالح.');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('البريد الإلكتروني غير صالح.');
      return;
    }

    if (
      exam.access_code &&
      profile.accessCode.trim().toUpperCase() !== exam.access_code.trim().toUpperCase()
    ) {
      setFormError('رمز الدخول غير صحيح.');
      return;
    }

    try {
      if (!exam.allow_multiple_attempts && !isDemoExam(exam)) {
        const existing = await checkExistingSubmission(exam.id, phone, email || null);
        if (existing) {
          setResult(existing);
          setStage('result');
          return;
        }
      }

      startedAtRef.current = new Date().toISOString();
      setStage('questions');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? `تعذر التحقق من المحاولات السابقة: ${error.message}`
          : 'تعذر التحقق من المحاولات السابقة.',
      );
    }
  }

  function setAnswer(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }

  function goNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goPrevious() {
    if (currentIndex > 0) {
      setCurrentIndex((index) => index - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function submitExam() {
    if (!startedAtRef.current) startedAtRef.current = new Date().toISOString();
    setSubmitting(true);
    setSubmitError('');

    const submittedAt = new Date().toISOString();
    const scored = scoreExam(exam, questions, answers);
    const payload: Submission = {
      exam_id: exam.id,
      student_name: profile.studentName.trim(),
      phone: profile.phone.trim(),
      email: profile.email.trim().toLowerCase() || null,
      score: scored.score,
      percentage: scored.percentage,
      status: scored.status,
      answers: scored.details,
      started_at: startedAtRef.current,
      submitted_at: submittedAt,
      duration_seconds: Math.round(
        (new Date(submittedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000,
      ),
      reviewed: false,
      admin_notes: '',
    };

    try {
      if (isDemoExam(exam)) {
        setResult({ ...payload, id: `local-${Date.now()}` });
      } else {
        const saved = await createSubmission(payload);
        setResult(saved);
      }
      setStage('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `تعذر حفظ النتيجة: ${error.message}`
          : 'تعذر حفظ النتيجة.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (stage !== 'questions' || !examEnded || autoSubmittedRef.current || submitting) return;
    autoSubmittedRef.current = true;
    void submitExam();
  }, [examEnded, stage, submitting]);

  if (loading) {
    return (
      <main className="centered-screen">
        <Loader2 className="spin" size={28} aria-hidden />
        <span>جاري تحميل الاختبار...</span>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="centered-screen">
        <AlertTriangle size={28} aria-hidden />
        <strong>تعذر تحميل الاختبار</strong>
        <span>{loadError}</span>
        <button className="secondary-action" onClick={onBack} type="button">
          <ArrowRight size={18} aria-hidden />
          العودة
        </button>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="centered-screen">
        <AlertTriangle size={28} aria-hidden />
        <strong>لم تُضف أسئلة لهذا الاختبار بعد</strong>
        <span>أضف الأسئلة من لوحة الإدارة ثم أعد نشر الاختبار.</span>
        <button className="secondary-action" onClick={onBack} type="button">
          <ArrowRight size={18} aria-hidden />
          العودة
        </button>
      </main>
    );
  }

  if (stage === 'result' && result) {
    const isPassed = result.status === 'passed';
    const showDetailedAnswers =
      exam.show_results_immediately || (examEnded && exam.show_answers_after_end);
    return (
      <motion.main 
        className="content-band"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <section className="tool-panel result-panel">
          <div className="result-header">
            {isPassed ? (
              <div className="icon-circle success">
                <CheckCircle2 size={32} aria-hidden />
              </div>
            ) : (
              <div className="icon-circle danger">
                <XCircle size={32} aria-hidden />
              </div>
            )}
            <h2>{isPassed ? 'تم اجتياز الاختبار بنجاح' : 'لم يتم اجتياز الاختبار'}</h2>
            <p>شكرًا لك يا {result.student_name} على مشاركتك في {exam.title}.</p>
          </div>

          <div className="result-stats">
            <div>
              <span>النتيجة المئوية</span>
              <strong>{result.percentage.toFixed(1)}%</strong>
            </div>
            <div>
              <span>النقاط</span>
              <strong>
                {result.score} / {questions.reduce((sum, q) => sum + (q.points || 1), 0)}
              </strong>
            </div>
          </div>

          {!showDetailedAnswers && (
            <div className="notice warning full">
              <AlertTriangle size={18} aria-hidden />
              <span>لا يمكن عرض الإجابات الصحيحة حالياً بناءً على إعدادات الاختبار. ستُعلن النتائج التفصيلية لاحقاً.</span>
            </div>
          )}

          {showDetailedAnswers && (
            <div className="result-answers-list">
              <h3>مراجعة الإجابات</h3>
              {result.answers.map((answer, index) => (
                <article className="result-answer-item" key={index}>
                  <div className="result-answer-meta">
                    <span className="question-number">سؤال {index + 1}</span>
                    <strong className={answer.is_correct ? 'text-success' : 'text-danger'}>
                      {answer.is_correct ? 'إجابة صحيحة' : 'إجابة خاطئة'}
                    </strong>
                  </div>
                  <p className="question-prompt">{answer.prompt}</p>
                  <div className="answer-comparison">
                    <div className="student-answer">
                      <span>إجابتك:</span>
                      <strong>{answer.answer || 'بدون إجابة'}</strong>
                    </div>
                    {!answer.is_correct && (
                      <div className="correct-answer">
                        <span>الإجابة الصحيحة:</span>
                        <strong>{answer.correct_answer}</strong>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="flow-actions full">
            <button className="secondary-action" onClick={onBack} type="button">
              <ArrowRight size={18} aria-hidden />
              العودة للرئيسية
            </button>
          </div>
        </section>
      </motion.main>
    );
  }

  if (examEnded) {
    if (exam.show_answers_after_end) {
      return <ExamAnswerReview exam={exam} questions={questions} />;
    }

    return (
      <main className="centered-screen">
        <Clock3 size={30} aria-hidden />
        <strong>انتهى موعد الاختبار</strong>
        <span>
          انتهى الاختبار في {formatExamEndTime(exam.ends_at)}. لم تُتح الأسئلة والإجابات للعرض بعد.
        </span>
        <button className="secondary-action" onClick={onBack} type="button">
          <ArrowRight size={18} aria-hidden />
          العودة
        </button>
      </main>
    );
  }

  if (stage === 'profile') {
    return (
      <motion.main 
        className="content-band assessment-shell"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <section className="tool-panel">
          <div className="section-heading compact">
            <span className="section-kicker">{exam.dawra?.title || exam.title}</span>
            <h2>بيانات المشارك</h2>
          </div>

          <form className="form-grid" onSubmit={handleProfileSubmit} noValidate>
            <label className="field full">
              <span>الاسم الكامل</span>
              <input
                value={profile.studentName}
                onChange={(event) => updateProfile('studentName', event.target.value)}
                placeholder="اسم الطالب"
              />
            </label>
            <label className="field">
              <span>رقم الهاتف</span>
              <input
                value={profile.phone}
                onChange={(event) => updateProfile('phone', event.target.value)}
                placeholder="مثال: 03123456"
                inputMode="tel"
              />
            </label>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                value={profile.email}
                onChange={(event) => updateProfile('email', event.target.value)}
                placeholder="اختياري"
                type="email"
              />
            </label>
            {exam.access_code && (
              <label className="field full">
                <span>رمز دخول الاختبار</span>
                <input
                  value={profile.accessCode}
                  onChange={(event) => updateProfile('accessCode', event.target.value)}
                  placeholder="أدخل الرمز المخصص للدورة"
                />
              </label>
            )}

            {formError && (
              <div className="notice danger full">
                <AlertTriangle size={18} aria-hidden />
                <span>{formError}</span>
              </div>
            )}

            <div className="flow-actions full">
              <button className="secondary-action" onClick={onBack} type="button">
                <ArrowRight size={18} aria-hidden />
                العودة
              </button>
              <button className="primary-action" type="submit">
                <ArrowLeft size={18} aria-hidden />
                بدء الأسئلة
              </button>
            </div>
          </form>
        </section>
      </motion.main>
    );
  }

  return (
    <motion.main 
      className="assessment-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="progress-strip">
        <div>
          <strong>
            السؤال {currentIndex + 1}
            <span> / {questions.length}</span>
          </strong>
          <small>{answeredCount} مُجاب</small>
        </div>
        <div className="progress-track">
          <span style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section 
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="question-card"
        >
          <div className="question-card-header">
            <span>{currentQuestion.type === 'short_answer' ? 'إجابة قصيرة' : currentQuestion.type === 'true_false' ? 'صح أو خطأ' : 'اختيار من متعدد'}</span>
            <strong>{currentQuestion.points} نقطة</strong>
          </div>
          <h2>{currentQuestion.prompt}</h2>

          {currentQuestion.type === 'multiple_choice' && (
            <div className="option-list">
              {currentQuestion.options.map((option, index) => {
                const selected = answers[currentQuestion.id] === option;
                return (
                  <button
                    className={`option-button ${selected ? 'selected' : ''}`}
                    key={option}
                    onClick={() => setAnswer(currentQuestion.id, option)}
                    type="button"
                  >
                    {selected ? <CheckCircle2 size={19} aria-hidden /> : <Circle size={19} aria-hidden />}
                    <span className="option-index">{OPTION_LABELS[index] || index + 1}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.type === 'true_false' && (
            <div className="segmented-options">
              {TRUE_FALSE_OPTIONS.map((option) => (
                <button
                  className={answers[currentQuestion.id] === option.value ? 'selected' : ''}
                  key={option.value}
                  onClick={() => setAnswer(currentQuestion.id, option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === 'short_answer' && (
            <label className="field full">
              <span>الإجابة</span>
              <textarea
                value={answers[currentQuestion.id] || ''}
                onChange={(event) => setAnswer(currentQuestion.id, event.target.value)}
                placeholder="اكتب إجابتك هنا"
                rows={4}
              />
            </label>
          )}
        </motion.section>
      </AnimatePresence>

      {submitError && (
        <div className="notice danger narrow">
          <AlertTriangle size={18} aria-hidden />
          <span>{submitError}</span>
        </div>
      )}

      <div className="question-nav">
        <button className="secondary-action" onClick={goPrevious} disabled={currentIndex === 0} type="button">
          <ArrowRight size={18} aria-hidden />
          السابق
        </button>
        {currentIndex < questions.length - 1 ? (
          <button className="primary-action" onClick={goNext} type="button">
            التالي
            <ArrowLeft size={18} aria-hidden />
          </button>
        ) : (
          <button className="primary-action" onClick={submitExam} disabled={submitting} type="button">
            {submitting ? <Loader2 className="spin" size={18} aria-hidden /> : <Send size={18} aria-hidden />}
            تسليم الإجابات
          </button>
        )}
      </div>
    </motion.main>
  );
}
