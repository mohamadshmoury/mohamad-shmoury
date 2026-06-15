import { Loader2, Plus, Save, Trash2, FileQuestion } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createQuestion, deleteQuestion } from '../../lib/examService';
import { getCorrectAnswerLabel } from '../../lib/scoring';
import type { Exam, Question, QuestionType } from '../../types';

interface QuestionManagerProps {
  exams: Exam[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  questions: Question[];
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
}

const OPTION_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function questionTypeLabel(type: QuestionType) {
  if (type === 'multiple_choice') return 'اختيار من متعدد';
  if (type === 'true_false') return 'صح أو خطأ';
  return 'إجابة قصيرة';
}

interface QuestionFormState {
  prompt: string;
  type: QuestionType;
  options: string[];
  correctOptionIndex: number;
  trueFalseAnswer: 'true' | 'false';
  shortAnswers: string[];
  points: number;
}

function createEmptyQuestionForm(type: QuestionType = 'multiple_choice'): QuestionFormState {
  return {
    prompt: '',
    type,
    options: ['', ''],
    correctOptionIndex: 0,
    trueFalseAnswer: 'true',
    shortAnswers: [''],
    points: 1,
  };
}

// Inline ExamPicker to keep it simple
function ExamPicker({
  exams,
  selectedExamId,
  onSelect,
}: {
  exams: Exam[];
  selectedExamId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <label className="field full picker">
      <span>اختر الاختبار أولًا لإدارة أسئلته:</span>
      <select value={selectedExamId} onChange={(e) => onSelect(e.target.value)}>
        <option value="">-- يرجى الاختيار --</option>
        {exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.dawra?.title ? `[${exam.dawra.title}] ` : ''}
            {exam.title}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function QuestionManager({
  exams,
  selectedExamId,
  setSelectedExamId,
  questions,
  setQuestions,
  loading,
  setLoading,
  setNotice,
  setError,
}: QuestionManagerProps) {
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(() =>
    createEmptyQuestionForm(),
  );

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) || null;

  function changeQuestionType(type: QuestionType) {
    setQuestionForm((prev) => ({ ...createEmptyQuestionForm(type), prompt: prev.prompt }));
  }

  function addQuestionOption() {
    setQuestionForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  }

  function updateQuestionOption(index: number, val: string) {
    setQuestionForm((prev) => {
      const newOpts = [...prev.options];
      newOpts[index] = val;
      return { ...prev, options: newOpts };
    });
  }

  function removeQuestionOption(index: number) {
    setQuestionForm((prev) => {
      if (prev.options.length <= 2) return prev;
      const newOpts = prev.options.filter((_, i) => i !== index);
      let newCorrect = prev.correctOptionIndex;
      if (newCorrect === index) newCorrect = 0;
      else if (newCorrect > index) newCorrect -= 1;
      return { ...prev, options: newOpts, correctOptionIndex: newCorrect };
    });
  }

  function addShortAnswer() {
    setQuestionForm((prev) => ({ ...prev, shortAnswers: [...prev.shortAnswers, ''] }));
  }

  function updateShortAnswer(index: number, val: string) {
    setQuestionForm((prev) => {
      const newAnswers = [...prev.shortAnswers];
      newAnswers[index] = val;
      return { ...prev, shortAnswers: newAnswers };
    });
  }

  function removeShortAnswer(index: number) {
    setQuestionForm((prev) => {
      if (prev.shortAnswers.length <= 1) return prev;
      return { ...prev, shortAnswers: prev.shortAnswers.filter((_, i) => i !== index) };
    });
  }

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');

    if (!selectedExamId) {
      setError('اختر اختبارًا أولاً.');
      return;
    }
    if (!questionForm.prompt.trim()) {
      setError('نص السؤال مطلوب.');
      return;
    }

    setLoading(true);
    try {
      const qData: Partial<Question> = {
        exam_id: selectedExamId,
        prompt: questionForm.prompt.trim(),
        type: questionForm.type,
        points: questionForm.points,
      };

      if (questionForm.type === 'multiple_choice') {
        const validOptions = questionForm.options.map((o) => o.trim()).filter(Boolean);
        if (validOptions.length < 2) throw new Error('يرجى توفير خيارين على الأقل.');
        qData.options = validOptions;
        qData.correct_answer = {
          value: validOptions[Math.min(questionForm.correctOptionIndex, validOptions.length - 1)],
        };
      } else if (questionForm.type === 'true_false') {
        qData.correct_answer = { value: questionForm.trueFalseAnswer };
      } else if (questionForm.type === 'short_answer') {
        const validAnswers = questionForm.shortAnswers.map((a) => a.trim()).filter(Boolean);
        if (validAnswers.length === 0) throw new Error('يرجى توفير إجابة مقبولة واحدة على الأقل.');
        qData.correct_answer = { values: validAnswers };
      }

      const created = await createQuestion({
        examId: selectedExamId,
        prompt: questionForm.prompt.trim(),
        type: questionForm.type,
        options: qData.options || [],
        correctAnswer: qData.correct_answer!,
        points: questionForm.points,
        sortOrder: questions.length + 1,
      });
      setQuestions((prev) => [...prev, created]);
      setQuestionForm((prev) => ({ ...createEmptyQuestionForm(prev.type), prompt: '' }));
      setNotice('تم إضافة السؤال.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة السؤال.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm('هل تريد حذف هذا السؤال؟')) return;
    setLoading(true);
    try {
      await deleteQuestion(questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setNotice('تم حذف السؤال.');
    } catch (err) {
      setError('تعذر حذف السؤال.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-grid">
      <section className="tool-panel">
        <ExamPicker exams={exams} selectedExamId={selectedExamId} onSelect={setSelectedExamId} />
        <div className="section-heading compact">
          <span className="section-kicker">سؤال جديد</span>
          <h3>{selectedExam?.title || 'اختر اختبارًا'}</h3>
        </div>
        <form className="question-builder" onSubmit={handleCreateQuestion} noValidate>
          <div className="question-builder-toolbar">
            <label className="field">
              <span>نوع السؤال</span>
              <select
                value={questionForm.type}
                onChange={(event) => changeQuestionType(event.target.value as QuestionType)}
              >
                <option value="multiple_choice">اختيار من متعدد</option>
                <option value="true_false">صح أو خطأ</option>
                <option value="short_answer">إجابة قصيرة</option>
              </select>
            </label>
            <label className="field points-field">
              <span>النقاط</span>
              <input
                value={questionForm.points}
                onChange={(event) => setQuestionForm((prev) => ({ ...prev, points: Number(event.target.value) }))}
                min={1}
                type="number"
              />
            </label>
          </div>

          <label className="field full question-prompt-field">
            <span>نص السؤال</span>
            <textarea
              value={questionForm.prompt}
              onChange={(event) => setQuestionForm((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder="اكتب السؤال كما سيظهر للطالب"
              rows={4}
            />
          </label>

          {questionForm.type === 'multiple_choice' && (
            <div className="answer-builder">
              <div className="answer-builder-title">
                <strong>خيارات الإجابة</strong>
                <span>ضع علامة على الإجابة الصحيحة</span>
              </div>
              <div className="option-editor-list">
                {questionForm.options.map((option, index) => (
                  <div
                    className={`option-editor-row ${questionForm.correctOptionIndex === index ? 'is-correct' : ''}`}
                    key={`option-${index}`}
                  >
                    <label className="choice-marker" title="تحديد الإجابة الصحيحة">
                      <input
                        checked={questionForm.correctOptionIndex === index}
                        onChange={() => setQuestionForm((prev) => ({ ...prev, correctOptionIndex: index }))}
                        type="radio"
                        name="correctOption"
                      />
                      <span>{OPTION_LABELS[index] || index + 1}</span>
                    </label>
                    <input
                      value={option}
                      onChange={(event) => updateQuestionOption(index, event.target.value)}
                      placeholder={`الخيار ${OPTION_LABELS[index] || index + 1}`}
                    />
                    <button
                      className="danger-icon small-icon"
                      disabled={questionForm.options.length <= 2}
                      onClick={() => removeQuestionOption(index)}
                      type="button"
                      title="حذف الخيار"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <button className="secondary-action small fit-action" onClick={addQuestionOption} type="button">
                <Plus size={16} aria-hidden />
                إضافة خيار
              </button>
            </div>
          )}

          {questionForm.type === 'true_false' && (
            <div className="answer-builder">
              <div className="answer-builder-title">
                <strong>الإجابة الصحيحة</strong>
                <span>اختر القيمة الصحيحة لهذا السؤال</span>
              </div>
              <div className="form-choice-grid">
                {[
                  ['true', 'صح'],
                  ['false', 'خطأ'],
                ].map(([value, label]) => (
                  <button
                    className={questionForm.trueFalseAnswer === value ? 'selected' : ''}
                    key={value}
                    onClick={() =>
                      setQuestionForm((prev) => ({
                        ...prev,
                        trueFalseAnswer: value as 'true' | 'false',
                      }))
                    }
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {questionForm.type === 'short_answer' && (
            <div className="answer-builder">
              <div className="answer-builder-title">
                <strong>الإجابات المقبولة</strong>
                <span>أضف كل صيغة صحيحة في حقل مستقل</span>
              </div>
              <div className="option-editor-list">
                {questionForm.shortAnswers.map((answer, index) => (
                  <div className="option-editor-row short-answer-row" key={`short-answer-${index}`}>
                    <span className="short-answer-index">{index + 1}</span>
                    <input
                      value={answer}
                      onChange={(event) => updateShortAnswer(index, event.target.value)}
                      placeholder="إجابة صحيحة مقبولة"
                    />
                    <button
                      className="danger-icon small-icon"
                      disabled={questionForm.shortAnswers.length <= 1}
                      onClick={() => removeShortAnswer(index)}
                      type="button"
                      title="حذف الإجابة"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <button className="secondary-action small fit-action" onClick={addShortAnswer} type="button">
                <Plus size={16} aria-hidden />
                إضافة إجابة
              </button>
            </div>
          )}

          <button className="primary-action" disabled={loading || !selectedExamId} type="submit">
            {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <Save size={18} aria-hidden />}
            حفظ السؤال
          </button>
        </form>
      </section>

      <section className="tool-panel">
        <div className="section-heading compact">
          <span className="section-kicker">أسئلة الاختبار</span>
          <h3>{questions.length} سؤال</h3>
        </div>
        <div className="question-admin-list">
          {questions.map((question, index) => (
            <article className="question-admin-item" key={question.id}>
              <div className="question-admin-main">
                <span>{index + 1}. {questionTypeLabel(question.type)}</span>
                <strong>{question.prompt}</strong>
                <small>الإجابة: {getCorrectAnswerLabel(question)}</small>
              </div>
              <button className="danger-icon" onClick={() => handleDeleteQuestion(question.id)} type="button" title="حذف السؤال">
                <Trash2 size={18} aria-hidden />
              </button>
            </article>
          ))}
          {questions.length === 0 && selectedExamId && (
            <div className="empty-state small">لا توجد أسئلة بعد.</div>
          )}
        </div>
      </section>
    </div>
  );
}
