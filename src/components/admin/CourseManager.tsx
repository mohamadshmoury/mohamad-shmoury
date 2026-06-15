import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';
import { createDawra, updateDawra, uploadPublicAsset, updateExamPublishState, updateExamSettings, deleteDawra } from '../../lib/examService';
import type { Dawra, Exam, CourseStatus, CourseAttachment } from '../../types';

interface CourseManagerProps {
  dawrat: Dawra[];
  exams: Exam[];
  selectedDawraId: string;
  setDawrat: React.Dispatch<React.SetStateAction<Dawra[]>>;
  setExams: React.Dispatch<React.SetStateAction<Exam[]>>;
  selectDawra: (id: string) => void;
  setActiveTab: (tab: 'courses' | 'exams' | 'questions' | 'submissions' | 'profile') => void;
  setSelectedExamId: (id: string) => void;
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

function fileNameWithoutExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

export default function CourseManager({
  dawrat,
  exams,
  selectedDawraId,
  setDawrat,
  setExams,
  selectDawra,
  setActiveTab,
  setSelectedExamId,
  loading,
  setLoading,
  setNotice,
  setError,
}: CourseManagerProps) {
  const [courseForm, setCourseForm] = useState({
    id: '',
    title: '',
    subtitle: '',
    description: '',
    sheikhIntro:
      'هذه الدورة من الدورات التي تقام باسم الشيخ محمد أحمد الشموري، ويُحفظ اختبارها ونتائج طلابها في هذه المنصة.',
    status: 'in_progress' as CourseStatus,
    duration: '',
    startsOn: '',
  });

  const [courseAttachments, setCourseAttachments] = useState<CourseAttachment[]>([]);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);

  function clearAttachmentDraft() {
    setNewAttachmentName('');
    setNewAttachmentFile(null);
    if (attachmentFileInputRef.current) {
      attachmentFileInputRef.current.value = '';
    }
  }

  function handleAttachmentFileChange(file: File | null) {
    setNewAttachmentFile(file);
    if (file && !newAttachmentName.trim()) {
      setNewAttachmentName(fileNameWithoutExtension(file.name));
    }
  }

  async function addAttachment() {
    const name = newAttachmentName.trim();
    if (!name || !newAttachmentFile) {
      setError('اسم الملف والملف المرفوع مطلوبان.');
      return;
    }

    setUploadingAttachment(true);
    setError('');
    setNotice('');
    try {
      const url = await uploadPublicAsset(newAttachmentFile, 'course-files');
      setCourseAttachments((prev) => [...prev, { name, url }]);
      clearAttachmentDraft();
      setNotice('تم رفع الملف وإضافته إلى الدورة.');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? `تعذر رفع الملف: ${uploadError.message}`
          : 'تعذر رفع الملف.',
      );
    } finally {
      setUploadingAttachment(false);
    }
  }

  function removeAttachment(index: number) {
    setCourseAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');

    if (!courseForm.title.trim()) {
      setError('عنوان الدورة مطلوب.');
      return;
    }

    setLoading(true);
    try {
      if (courseForm.id) {
        const updated = await updateDawra(courseForm.id, {
          title: courseForm.title.trim(),
          subtitle: courseForm.subtitle.trim(),
          description: courseForm.description.trim(),
          sheikhIntro: courseForm.sheikhIntro.trim(),
          status: courseForm.status,
          duration: courseForm.duration.trim(),
          startsOn: courseForm.startsOn,
          attachments: courseAttachments,
        });
        setDawrat((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setNotice('تم تحديث الدورة بنجاح.');
        cancelEditCourse();
      } else {
        const created = await createDawra({
          title: courseForm.title.trim(),
          subtitle: courseForm.subtitle.trim(),
          description: courseForm.description.trim(),
          sheikhIntro: courseForm.sheikhIntro.trim(),
          status: courseForm.status,
          duration: courseForm.duration.trim(),
          startsOn: courseForm.startsOn,
          attachments: courseAttachments,
        });
        setDawrat((prev) => [created, ...prev]);
        selectDawra(created.id);
        setActiveTab('exams');
        setNotice('تم إنشاء الدورة. يمكنك الآن إضافة اختبار لها.');
        cancelEditCourse();
      }
    } catch (createError) {
      setError(
        createError instanceof Error
          ? `تعذر حفظ الدورة: ${createError.message}`
          : 'تعذر حفظ الدورة.',
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditCourse(dawra: Dawra) {
    setCourseForm({
      id: dawra.id,
      title: dawra.title,
      subtitle: dawra.subtitle || '',
      description: dawra.description || '',
      sheikhIntro: dawra.sheikh_intro || '',
      status: normalizeCourseStatus(dawra.status),
      duration: dawra.duration || '',
      startsOn: dawra.starts_on || '',
    });
    setCourseAttachments(dawra.attachments || []);
    setNotice('تم تحميل بيانات الدورة للتعديل.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditCourse() {
    setCourseForm({
      id: '',
      title: '',
      subtitle: '',
      description: '',
      sheikhIntro:
        'هذه الدورة من الدورات التي تقام باسم الشيخ محمد أحمد الشموري، ويُحفظ اختبارها ونتائج طلابها في هذه المنصة.',
      status: 'in_progress',
      duration: '',
      startsOn: '',
    });
    setCourseAttachments([]);
    clearAttachmentDraft();
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

  async function handleDeleteCourse(dawraId: string) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الدورة؟ سيتم حذف جميع الاختبارات والأسئلة المرتبطة بها.')) {
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await deleteDawra(dawraId);
      setDawrat((prev) => prev.filter((d) => d.id !== dawraId));
      if (selectedDawraId === dawraId) {
        selectDawra('');
      }
      if (courseForm.id === dawraId) {
        cancelEditCourse();
      }
      setNotice('تم حذف الدورة بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? `تعذر حذف الدورة: ${err.message}` : 'تعذر حذف الدورة.');
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="admin-grid courses-management-grid">
      <div className="stacked-panels">
        <section className="tool-panel">
          <div className="section-heading compact">
            <span className="section-kicker">
              <BookOpen size={16} aria-hidden />
              {courseForm.id ? 'تعديل الدورة' : 'دورة جديدة'}
            </span>
            <h3>{courseForm.id ? `تعديل الدورة: ${courseForm.title}` : 'إنشاء دورة مستقلة'}</h3>
          </div>
          <form className="form-grid" onSubmit={handleCreateCourse} noValidate>
            <label className="field full">
              <span>عنوان الدورة</span>
              <input
                value={courseForm.title}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="مثال: دورة آداب طالب العلم"
              />
            </label>
            <label className="field">
              <span>وصف قصير</span>
              <input
                value={courseForm.subtitle}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                placeholder="اختياري"
              />
            </label>
            <label className="field">
              <span>مدة الدورة</span>
              <input
                value={courseForm.duration}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, duration: event.target.value }))}
                placeholder="مثال: 4 أسابيع، 10 ساعات"
              />
            </label>
            <label className="field">
              <span>موعد البداية</span>
              <input
                value={courseForm.startsOn}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, startsOn: event.target.value }))}
                type="date"
              />
            </label>
            <label className="field full">
              <span>وصف الدورة</span>
              <textarea
                value={courseForm.description}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
              />
            </label>
            <label className="field full">
              <span>نبذة تظهر في صفحة الدورة</span>
              <textarea
                value={courseForm.sheikhIntro}
                onChange={(event) => setCourseForm((prev) => ({ ...prev, sheikhIntro: event.target.value }))}
                rows={3}
              />
            </label>
            
            {/* Attachments Section */}
            <div className="attachments-builder full">
              <span className="builder-title">ملفات اختيارية للدورة</span>
              <div className="attachment-add-row">
                <input
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                  placeholder="اسم الملف (مثال: كتاب الشرح pdf)"
                />
                <div className="file-picker">
                  <input
                    ref={attachmentFileInputRef}
                    className="file-input-hidden"
                    type="file"
                    onChange={(event) => handleAttachmentFileChange(event.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    className="secondary-action file-picker-button"
                    onClick={() => attachmentFileInputRef.current?.click()}
                  >
                    <UploadCloud size={17} aria-hidden />
                    {newAttachmentFile ? 'تغيير الملف' : 'رفع ملف'}
                  </button>
                  {newAttachmentFile && (
                    <span className="selected-file-name">{newAttachmentFile.name}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={addAttachment}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? <Loader2 className="spin" size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
                  إضافة ملف
                </button>
              </div>
              {courseAttachments.length > 0 && (
                <ul className="attachments-list">
                  {courseAttachments.map((file, idx) => (
                    <li key={idx} className="attachment-item">
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        {file.name}
                      </a>
                      <button
                        type="button"
                        className="danger-icon small-icon"
                        onClick={() => removeAttachment(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="availability-control full" role="group" aria-label="حالة ظهور الدورة">
              <span>حالة ظهور الدورة</span>
              <div className="availability-options">
                <button
                  className={courseForm.status === 'in_progress' ? 'selected' : ''}
                  onClick={() => setCourseForm((prev) => ({ ...prev, status: 'in_progress' }))}
                  type="button"
                >
                  <CheckCircle2 size={17} aria-hidden />
                  قيد التنفيذ
                </button>
                <button
                  className={courseForm.status === 'completed' ? 'selected' : ''}
                  onClick={() => setCourseForm((prev) => ({ ...prev, status: 'completed' }))}
                  type="button"
                >
                  <BookOpen size={17} aria-hidden />
                  منتهية
                </button>
                <button
                  className={courseForm.status === 'draft' ? 'selected' : ''}
                  onClick={() => setCourseForm((prev) => ({ ...prev, status: 'draft' }))}
                  type="button"
                >
                  <CalendarDays size={17} aria-hidden />
                  قادمة
                </button>
              </div>
            </div>
            
            <div className="flow-actions full">
              {courseForm.id && (
                <button className="secondary-action" type="button" onClick={cancelEditCourse}>
                  إلغاء التعديل
                </button>
              )}
              <button className="primary-action" disabled={loading} type="submit" style={{ flex: 1 }}>
                {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
                {courseForm.id ? 'حفظ التعديلات' : 'حفظ الدورة'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="tool-panel list-panel">
        <div className="section-heading compact">
          <span className="section-kicker">الدورات الحالية</span>
          <h3>{dawrat.length} دورة</h3>
        </div>
        <div className="admin-list">
          {dawrat.map((dawra) => {
            const dawraExams = exams.filter((exam) => exam.dawra_id === dawra.id);
            const status = normalizeCourseStatus(dawra.status);
            return (
              <article className={`course-group ${selectedDawraId === dawra.id ? 'is-selected' : ''}`} key={dawra.id}>
                <div className="course-group-header">
                  <div>
                    <strong>{dawra.title}</strong>
                    <span>
                      {dawra.subtitle || 'دورة بدون وصف قصير'}
                      {dawra.duration && ` • المدة: ${dawra.duration}`}
                      {dawra.starts_on && ` • البداية: ${dawra.starts_on}`}
                      {dawra.attachments && dawra.attachments.length > 0 && ` • المرفقات: ${dawra.attachments.length}`}
                    </span>
                  </div>
                  <div className="item-actions">
                    <span className={`admin-status-pill is-${status}`}>
                      {COURSE_STATUS_LABELS[status]}
                    </span>
                    <button className="secondary-action small" onClick={() => startEditCourse(dawra)} type="button">
                      تعديل الدورة
                    </button>
                    <button className="danger-action small" onClick={() => handleDeleteCourse(dawra.id)} type="button" disabled={loading}>
                      حذف الدورة
                    </button>
                    <button
                      className="ghost-action small"
                      onClick={() => {
                        selectDawra(dawra.id);
                        setActiveTab('exams');
                      }}
                      type="button"
                    >
                      إضافة اختبار
                    </button>
                  </div>
                </div>
                <div className="course-exam-list">
                  {dawraExams.map((exam) => (
                    <div className="course-exam-row" key={exam.id}>
                      <div>
                        <strong>{exam.title}</strong>
                        <span>
                          {exam.is_published ? 'منشور' : 'مسودة'} • {exam.show_results_immediately ? 'عرض النتائج مباشرة' : 'حجب النتائج'}
                        </span>
                      </div>
                      <div className="item-actions">
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
                          {exam.show_results_immediately ? 'حجب' : 'عرض'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {dawraExams.length === 0 && (
                    <span className="course-empty">لا يوجد اختبار لهذه الدورة بعد.</span>
                  )}
                </div>
              </article>
            );
          })}
          {dawrat.length === 0 && <div className="empty-state small">لا توجد دورات بعد.</div>}
        </div>
      </section>
    </div>
  );
}
