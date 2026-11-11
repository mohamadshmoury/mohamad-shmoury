import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Link2,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { createDawra, updateDawra, uploadPublicAsset, updateExamPublishState, updateExamSettings, deleteDawra } from '../../lib/examService';
import { computeProgramAvailability, ghawthaniAdmin, type IjazahProgram } from '../../lib/ghawthaniService';
import type {
  Dawra,
  Exam,
  CourseStatus,
  CourseAttachment,
  CourseMaterialKind,
} from '../../types';

interface CourseManagerProps {
  adminToken?: string;
  dawrat: Dawra[];
  exams: Exam[];
  selectedDawraId: string;
  setDawrat: React.Dispatch<React.SetStateAction<Dawra[]>>;
  setExams: React.Dispatch<React.SetStateAction<Exam[]>>;
  selectDawra: (id: string) => void;
  setActiveTab: (tab: 'courses' | 'exams' | 'questions' | 'submissions' | 'profile' | 'ghawthani') => void;
  setSelectedExamId: (id: string) => void;
  onManageCourseCertificates?: (
    dawraId: string,
    section?: 'eligibility' | 'submissions' | 'issued' | 'templates' | 'programs',
  ) => void;
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

function createMaterialId() {
  return globalThis.crypto?.randomUUID?.()
    || `material-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isValidPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function CourseManager({
  adminToken,
  dawrat,
  exams,
  selectedDawraId,
  setDawrat,
  setExams,
  selectDawra,
  setActiveTab,
  setSelectedExamId,
  onManageCourseCertificates,
  loading,
  setLoading,
  setNotice,
  setError,
}: CourseManagerProps) {
  const [programs, setPrograms] = useState<IjazahProgram[]>([]);

  useEffect(() => {
    if (!adminToken) return;
    let mounted = true;
    ghawthaniAdmin<{ programs: IjazahProgram[] }>(adminToken, 'list_programs')
      .then((res) => {
        if (mounted) setPrograms(res.programs || []);
      })
      .catch(() => {
        // Ignore silent background load error on courses view
      });
    return () => {
      mounted = false;
    };
  }, [adminToken]);
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
  const [newAttachmentKind, setNewAttachmentKind] = useState<CourseMaterialKind>('file');
  const [newAttachmentWeek, setNewAttachmentWeek] = useState('');
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);

  function clearAttachmentDraft() {
    setNewAttachmentWeek('');
    setNewAttachmentName('');
    setNewAttachmentUrl('');
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
    if (!name) {
      setError('عنوان المادة مطلوب.');
      return;
    }

    if (newAttachmentKind === 'file' && !newAttachmentFile) {
      setError('اختر الملف الذي تريد إضافته.');
      return;
    }

    const linkUrl = newAttachmentUrl.trim();
    if (newAttachmentKind === 'link' && !isValidPublicUrl(linkUrl)) {
      setError('أدخل رابطاً صحيحاً يبدأ بـ http:// أو https://.');
      return;
    }

    setUploadingAttachment(true);
    setError('');
    setNotice('');
    try {
      const url = newAttachmentKind === 'file'
        ? await uploadPublicAsset(newAttachmentFile!, 'course-files')
        : linkUrl;
      setCourseAttachments((prev) => [
        ...prev,
        {
          id: createMaterialId(),
          name,
          url,
          kind: newAttachmentKind,
          week: newAttachmentWeek.trim(),
        },
      ]);
      clearAttachmentDraft();
      setNotice(newAttachmentKind === 'file'
        ? 'تم رفع الملف وإضافته إلى مواد الدورة.'
        : 'تمت إضافة الرابط إلى مواد الدورة.');
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

  function moveAttachment(index: number, direction: -1 | 1) {
    setCourseAttachments((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
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
            
            {/* Course materials */}
            <div className="attachments-builder full">
              <div className="materials-builder-heading">
                <div>
                  <span className="builder-title">مواد الدورة الأسبوعية</span>
                  <small>أضف أي عدد من الملفات والروابط، ورتّبها بحسب تسلسل المحاضرات.</small>
                </div>
                <span className="materials-count">{courseAttachments.length} مادة</span>
              </div>

              <div className="material-kind-options" role="group" aria-label="نوع المادة">
                <button
                  type="button"
                  className={newAttachmentKind === 'file' ? 'selected' : ''}
                  onClick={() => setNewAttachmentKind('file')}
                >
                  <FileText size={16} aria-hidden />
                  ملف
                </button>
                <button
                  type="button"
                  className={newAttachmentKind === 'link' ? 'selected' : ''}
                  onClick={() => setNewAttachmentKind('link')}
                >
                  <Link2 size={16} aria-hidden />
                  رابط
                </button>
              </div>

              <div className="material-fields-grid">
                <label className="material-field">
                  <span>الأسبوع أو القسم</span>
                  <input
                    value={newAttachmentWeek}
                    onChange={(event) => setNewAttachmentWeek(event.target.value)}
                    placeholder="مثال: الأسبوع الأول"
                  />
                </label>
                <label className="material-field">
                  <span>عنوان المادة</span>
                  <input
                    value={newAttachmentName}
                    onChange={(event) => setNewAttachmentName(event.target.value)}
                    placeholder="مثال: تسجيل المحاضرة الأولى"
                  />
                </label>

                {newAttachmentKind === 'link' ? (
                  <label className="material-field material-source-field">
                    <span>الرابط</span>
                    <input
                      value={newAttachmentUrl}
                      onChange={(event) => setNewAttachmentUrl(event.target.value)}
                      placeholder="https://..."
                      inputMode="url"
                      dir="ltr"
                    />
                  </label>
                ) : (
                  <div className="material-field material-source-field">
                    <span>الملف</span>
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
                        {newAttachmentFile ? 'تغيير الملف' : 'اختيار ملف'}
                      </button>
                      {newAttachmentFile && (
                        <span className="selected-file-name">{newAttachmentFile.name}</span>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="primary-action material-add-button"
                  onClick={addAttachment}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? <Loader2 className="spin" size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
                  إضافة المادة
                </button>
              </div>

              {courseAttachments.length > 0 && (
                <ul className="attachments-list">
                  {courseAttachments.map((material, idx) => (
                    <li key={material.id || `${material.url}-${idx}`} className="attachment-item">
                      <div className="material-item-icon" aria-hidden>
                        {material.kind === 'link' ? <Link2 size={17} /> : <FileText size={17} />}
                      </div>
                      <div className="material-item-copy">
                        <span>{material.week || 'مواد عامة'}</span>
                        <a href={material.url} target="_blank" rel="noopener noreferrer">
                          {material.name}
                        </a>
                        <small>{material.kind === 'link' ? 'رابط خارجي' : 'ملف مرفوع'}</small>
                      </div>
                      <div className="material-item-actions">
                        <button
                          type="button"
                          className="ghost-icon small-icon"
                          onClick={() => moveAttachment(idx, -1)}
                          disabled={idx === 0}
                          aria-label={`نقل ${material.name} إلى أعلى`}
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="ghost-icon small-icon"
                          onClick={() => moveAttachment(idx, 1)}
                          disabled={idx === courseAttachments.length - 1}
                          aria-label={`نقل ${material.name} إلى أسفل`}
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          type="button"
                          className="danger-icon small-icon"
                          onClick={() => removeAttachment(idx)}
                          aria-label={`حذف ${material.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
            const linkedProgram = programs.find(
              (program) =>
                program.dawra_id === dawra.id
                || (!program.dawra_id && program.slug === 'ghawthani' && dawra.title.includes('الغوثاني')),
            );
            const programAvailability = linkedProgram ? computeProgramAvailability(linkedProgram) : null;
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
                          {exam.show_results_immediately ? 'حجب النتائج' : 'عرض النتائج'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {dawraExams.length === 0 && (
                    <span className="course-empty">لا يوجد اختبار لهذه الدورة بعد.</span>
                  )}
                </div>

                <div className="course-certificates-strip">
                  <div className="course-certificates-info">
                    <div className="course-certificates-title">
                      <Award size={16} aria-hidden />
                      <strong>الإجازات والشهادات</strong>
                      {linkedProgram && programAvailability ? (
                        <span className={`gh-status ${programAvailability.state === 'available' ? 'completed' : programAvailability.state === 'scheduled' ? 'pending' : 'not_required'}`}>
                          {programAvailability.state === 'available'
                            ? 'الإتاحة مفتوحة'
                            : programAvailability.state === 'scheduled'
                              ? 'مجدول'
                              : programAvailability.state === 'expired'
                                ? 'انتهت فترة الإتاحة'
                                : 'متوقف'}
                        </span>
                      ) : (
                        <span className="gh-status not_required">غير مُعدّ بعد</span>
                      )}
                    </div>
                    {linkedProgram ? (
                      <small>
                        المستندات المفعّلة:{' '}
                        {[linkedProgram.offers_certificate && 'شهادة', linkedProgram.offers_ijazah && 'إجازة']
                          .filter(Boolean)
                          .join(' و ')}{' '}
                        • الأهلية:{' '}
                        {linkedProgram.eligibility_method === 'legacy_attendance'
                          ? 'إقرار حضور الغوثاني'
                          : linkedProgram.eligibility_method === 'passed_exam'
                            ? 'النجاح في الاختبار'
                            : 'إضافة يدوية'}
                        {linkedProgram.requires_approval ? ' • يتطلب موافقة الإدارة' : ''}
                      </small>
                    ) : (
                      <small>فعّل الشهادات أو الإجازات وحدد طريقة الاستحقاق وفترة الإتاحة لهذه الدورة.</small>
                    )}
                  </div>
                  <div className="item-actions">
                    {linkedProgram ? (
                      <>
                        <button
                          className="secondary-action small"
                          type="button"
                          onClick={() =>
                            onManageCourseCertificates
                              ? onManageCourseCertificates(dawra.id, 'eligibility')
                              : setActiveTab('ghawthani')
                          }
                        >
                          المستحقون والإتاحة
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={() =>
                            onManageCourseCertificates
                              ? onManageCourseCertificates(dawra.id, 'submissions')
                              : setActiveTab('ghawthani')
                          }
                        >
                          الطلبات والإصدارات
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={() =>
                            onManageCourseCertificates
                              ? onManageCourseCertificates(dawra.id, 'issued')
                              : setActiveTab('ghawthani')
                          }
                        >
                          المستندات الصادرة
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={() =>
                            onManageCourseCertificates
                              ? onManageCourseCertificates(dawra.id, 'templates')
                              : setActiveTab('ghawthani')
                          }
                        >
                          القوالب
                        </button>
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={() =>
                            onManageCourseCertificates
                              ? onManageCourseCertificates(dawra.id, 'programs')
                              : setActiveTab('ghawthani')
                          }
                        >
                          <Settings2 size={14} aria-hidden />
                          الإعدادات
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary-action small"
                        type="button"
                        onClick={() =>
                          onManageCourseCertificates
                            ? onManageCourseCertificates(dawra.id, 'programs')
                            : setActiveTab('ghawthani')
                        }
                      >
                        <Award size={15} aria-hidden />
                        إعداد الإجازات والشهادات
                      </button>
                    )}
                  </div>
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
