import { Copy, FileQuestion, Loader2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createExamForDawra, updateExamSettings, updateExamPublishState, deleteExam } from '../../lib/examService';
import { copyText, createExamSlug, getExamShareUrl } from '../../lib/examLinks';
import type { Dawra, Exam, CourseStatus } from '../../types';

interface ExamManagerProps {
  exams: Exam[];
  dawrat: Dawra[];
  selectedDawraId: string;
  selectDawra: (id: string) => void;
  setExams: React.Dispatch<React.SetStateAction<Exam[]>>;
  setSelectedExamId: (id: string) => void;
  setActiveTab: (tab: 'courses' | 'exams' | 'questions' | 'submissions' | 'profile') => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
}

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'قادمة',
  active: 'قيد التنفيذ',
  in_progress: 'قيد التنفيذ',
  completed: 'منتهية',
  archived: 'مؤرشفة',
};

function normalizeCourseStatus(status: CourseStatus): CourseStatus {
  return status === 'active' ? 'in_progress' : status;
}

export default function ExamManager({
  exams,
  dawrat,
  selectedDawraId,
  selectDawra,
  setExams,
  setSelectedExamId,
  setActiveTab,
  loading,
  setLoading,
  setNotice,
  setError,
}: ExamManagerProps) {
  const [examForm, setExamForm] = useState({
    id: '',
    dawraId: selectedDawraId,
    examTitle: '',
    examDescription: '',
    accessCode: '',
    passingScore: 70,
    isPublished: true,
    showResultsImmediately: true,
  });

  const selectedDawra = dawrat.find((dawra) => dawra.id === selectedDawraId) || null;
  const selectedDawraExams = selectedDawraId
    ? exams.filter((exam) => exam.dawra_id === selectedDawraId)
    : [];

  async function handleSaveExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');

    const dawraId = examForm.dawraId || selectedDawraId;
    if (!dawraId) {
      setError('اختر دورة أولًا أو أنشئ دورة جديدة.');
      return;
    }

    if (!examForm.examTitle.trim()) {
      setError('عنوان الاختبار مطلوب.');
      return;
    }

    const requestedSlug = createExamSlug(examForm.examTitle);
    const conflictingExam = exams.find(
      (exam) => exam.id !== examForm.id && createExamSlug(exam.title) === requestedSlug,
    );
    if (conflictingExam) {
      setError(`يوجد اختبار آخر باسم "${conflictingExam.title}". استخدم عنوانًا مختلفًا ليبقى الرابط فريدًا.`);
      return;
    }

    setLoading(true);
    try {
      if (examForm.id) {
        // Edit existing exam
        const updated = await updateExamSettings(examForm.id, {
          title: examForm.examTitle.trim(),
          description: examForm.examDescription.trim(),
          accessCode: examForm.accessCode.trim(),
          passingScore: Number(examForm.passingScore) || 70,
          isPublished: examForm.isPublished,
          showResultsImmediately: examForm.showResultsImmediately,
        });
        setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        setNotice('تم تحديث الاختبار بنجاح.');
        cancelEdit();
      } else {
        // Create new exam
        const created = await createExamForDawra({
          dawraId,
          title: examForm.examTitle.trim(),
          description: examForm.examDescription.trim(),
          accessCode: examForm.accessCode.trim(),
          passingScore: Number(examForm.passingScore) || 70,
          isPublished: examForm.isPublished,
          showResultsImmediately: examForm.showResultsImmediately,
        });
        setExams((prev) => [created, ...prev]);
        setSelectedExamId(created.id);
        setActiveTab('questions');
        setNotice('تم إنشاء الاختبار. أضف الأسئلة الآن.');
        setExamForm((prev) => ({
          ...prev,
          examTitle: '',
          examDescription: '',
          accessCode: '',
          showResultsImmediately: true,
        }));
      }
    } catch (createError) {
      setError(
        createError instanceof Error
          ? `تعذر حفظ الاختبار: ${createError.message}`
          : 'تعذر حفظ الاختبار.',
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditExam(exam: Exam) {
    setExamForm({
      id: exam.id,
      dawraId: exam.dawra_id,
      examTitle: exam.title,
      examDescription: exam.description || '',
      accessCode: exam.access_code || '',
      passingScore: exam.passing_score,
      isPublished: exam.is_published,
      showResultsImmediately: exam.show_results_immediately,
    });
    if (exam.dawra_id) selectDawra(exam.dawra_id);
    setNotice('تم تحميل بيانات الاختبار للتعديل.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setExamForm({
      id: '',
      dawraId: selectedDawraId,
      examTitle: '',
      examDescription: '',
      accessCode: '',
      passingScore: 70,
      isPublished: true,
      showResultsImmediately: true,
    });
    setNotice('');
  }

  async function togglePublish(exam: Exam) {
    setLoading(true);
    setError('');
    try {
      const updated = await updateExamPublishState(exam.id, !exam.is_published);
      setExams((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? `تعذر تحديث النشر: ${publishError.message}`
          : 'تعذر تحديث النشر.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleResultsVisibility(exam: Exam) {
    setLoading(true);
    setError('');
    try {
      const updated = await updateExamSettings(exam.id, {
        showResultsImmediately: !exam.show_results_immediately,
      });
      setExams((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice('تم تحديث إعدادات عرض النتائج.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث إعدادات الاختبار.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExam(examId: string) {
    if (!window.confirm('هل أنت متأكد من حذف هذا الاختبار؟ سيتم حذف جميع الأسئلة والإجابات المرتبطة به.')) {
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await deleteExam(examId);
      setExams((prev) => prev.filter((e) => e.id !== examId));
      if (examForm.id === examId) {
        cancelEdit();
      }
      setNotice('تم حذف الاختبار بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? `تعذر حذف الاختبار: ${err.message}` : 'تعذر حذف الاختبار.');
    } finally {
      setLoading(false);
    }
  }

  async function copyExamLink(exam: Exam) {
    setError('');
    setNotice('');
    const conflictingExam = exams.find(
      (candidate) =>
        candidate.id !== exam.id &&
        createExamSlug(candidate.title) === createExamSlug(exam.title),
    );
    if (conflictingExam) {
      setError('لا يمكن إنشاء رابط بالاسم لأن اختبارًا آخر يحمل الاسم نفسه.');
      return;
    }
    try {
      await copyText(getExamShareUrl(exam));
      setNotice(`تم نسخ الرابط المباشر لاختبار "${exam.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر نسخ رابط الاختبار.');
    }
  }

  return (
    <div className="admin-grid exam-management-grid">
      <section className="tool-panel">
        <div className="section-heading compact">
          <span className="section-kicker">
            <FileQuestion size={16} aria-hidden />
            {examForm.id ? 'تعديل الاختبار' : 'اختبار جديد'}
          </span>
          <h3>{examForm.id ? `تعديل اختبار: ${examForm.examTitle}` : selectedDawra?.title ? `إضافة اختبار إلى ${selectedDawra.title}` : 'اختر دورة ثم أضف اختبارًا'}</h3>
        </div>
        <form className="form-grid" onSubmit={handleSaveExam} noValidate>
          <label className="field full">
            <span>الدورة</span>
            <select
              value={examForm.dawraId || selectedDawraId}
              onChange={(event) => {
                selectDawra(event.target.value);
                setExamForm((prev) => ({ ...prev, dawraId: event.target.value }));
              }}
            >
              <option value="">اختر دورة</option>
              {dawrat.map((dawra) => (
                <option key={dawra.id} value={dawra.id}>
                  {dawra.title} - {COURSE_STATUS_LABELS[normalizeCourseStatus(dawra.status)]}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
            <span>عنوان الاختبار</span>
            <input
              value={examForm.examTitle}
              onChange={(event) => setExamForm((prev) => ({ ...prev, examTitle: event.target.value }))}
              placeholder="مثال: الاختبار النهائي"
            />
          </label>
          <label className="field full">
            <span>وصف الاختبار</span>
            <textarea
              value={examForm.examDescription}
              onChange={(event) => setExamForm((prev) => ({ ...prev, examDescription: event.target.value }))}
              rows={3}
            />
          </label>
          <label className="field">
            <span>رمز دخول الطلاب</span>
            <input
              value={examForm.accessCode}
              onChange={(event) => setExamForm((prev) => ({ ...prev, accessCode: event.target.value }))}
              placeholder="اختياري"
            />
          </label>
          <label className="field">
            <span>درجة النجاح</span>
            <input
              value={examForm.passingScore}
              onChange={(event) => setExamForm((prev) => ({ ...prev, passingScore: Number(event.target.value) }))}
              min={1}
              max={100}
              type="number"
            />
          </label>
          <label className="check-row full">
            <input
              checked={examForm.isPublished}
              onChange={(event) => setExamForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
              type="checkbox"
            />
            <span>نشر الاختبار مباشرة</span>
          </label>
          <label className="check-row full">
            <input
              checked={examForm.showResultsImmediately}
              onChange={(event) => setExamForm((prev) => ({ ...prev, showResultsImmediately: event.target.checked }))}
              type="checkbox"
            />
            <span>عرض نتائج الإجابات للطلاب فور تسليم الاختبار</span>
          </label>
          <div className="flow-actions full">
            {examForm.id && (
              <button className="secondary-action" type="button" onClick={cancelEdit}>
                إلغاء التعديل
              </button>
            )}
            <button className="primary-action" disabled={loading || dawrat.length === 0} type="submit" style={{ flex: 1 }}>
              {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <FileQuestion size={18} aria-hidden />}
              {examForm.id ? 'حفظ التعديلات' : 'إنشاء الاختبار وإضافة الأسئلة'}
            </button>
          </div>
        </form>
      </section>

      <section className="tool-panel list-panel">
        <div className="section-heading compact">
          <span className="section-kicker">اختبارات الدورة</span>
          <h3>{selectedDawra?.title || 'لم يتم اختيار دورة'}</h3>
        </div>
        {selectedDawra ? (
          <div className="exam-course-summary">
            <span className={`admin-status-pill is-${normalizeCourseStatus(selectedDawra.status)}`}>
              {COURSE_STATUS_LABELS[normalizeCourseStatus(selectedDawra.status)]}
            </span>
            <strong>{selectedDawraExams.length} اختبار</strong>
            <small>{selectedDawra.subtitle || 'يمكنك نشر الاختبارات وإدارة الأسئلة من هنا.'}</small>
          </div>
        ) : (
          <div className="empty-state small">اختر دورة من القائمة لعرض اختباراتِها.</div>
        )}

        <div className="admin-list compact-list">
          {selectedDawraExams.map((exam) => (
            <article className="course-exam-row" key={exam.id}>
              <div>
                <strong>{exam.title}</strong>
                <span>
                  {exam.is_published ? 'منشور' : 'مسودة'} • {exam.show_results_immediately ? 'عرض النتائج مباشرة' : 'حجب النتائج'}
                </span>
                {exam.access_code && (
                  <span className="exam-access-code-badge">
                    رمز الدخول: <strong>{exam.access_code}</strong>
                  </span>
                )}
              </div>
              <div className="item-actions">
                <button
                  className="secondary-action small"
                  onClick={() => copyExamLink(exam)}
                  type="button"
                  disabled={!exam.is_published}
                  title={exam.is_published ? 'نسخ الرابط المباشر للاختبار' : 'انشر الاختبار أولًا لنسخ رابطه'}
                >
                  <Copy size={15} aria-hidden />
                  نسخ الرابط
                </button>
                <button
                  className="secondary-action small"
                  onClick={() => startEditExam(exam)}
                  type="button"
                >
                  تعديل
                </button>
                <button
                  className="danger-action small"
                  onClick={() => handleDeleteExam(exam.id)}
                  type="button"
                  disabled={loading}
                >
                  حذف
                </button>
                <button
                  className="secondary-action small"
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setActiveTab('questions');
                  }}
                  type="button"
                >
                  الأسئلة
                </button>
                <button className="ghost-action small" onClick={() => togglePublish(exam)} type="button">
                  {exam.is_published ? 'إلغاء النشر' : 'نشر'}
                </button>
                <button
                  className="ghost-action small"
                  onClick={() => toggleResultsVisibility(exam)}
                  type="button"
                  title={exam.show_results_immediately ? 'حجب النتائج' : 'عرض النتائج'}
                >
                  {exam.show_results_immediately ? 'حجب النتائج' : 'عرض النتائج'}
                </button>
              </div>
            </article>
          ))}
          {selectedDawra && selectedDawraExams.length === 0 && (
            <span className="course-empty">لا يوجد اختبار لهذه الدورة بعد.</span>
          )}
        </div>
      </section>
    </div>
  );
}
