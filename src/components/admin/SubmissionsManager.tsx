import { CheckCircle2, Download, Search, XCircle, Save, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { updateSubmissionReview, deleteSubmission } from '../../lib/examService';
import type { Exam, Submission } from '../../types';

interface SubmissionsManagerProps {
  exams: Exam[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  submissions: Submission[];
  setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
}

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
      <span>الاختبار</span>
      <select value={selectedExamId} onChange={(event) => onSelect(event.target.value)}>
        <option value="">اختر اختبارًا</option>
        {exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.dawra?.title || exam.title} - {exam.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function downloadCsv(filename: string, rows: Submission[]) {
  const headers = [
    'student_name',
    'phone',
    'email',
    'score',
    'percentage',
    'status',
    'submitted_at',
    'reviewed',
    'admin_notes',
  ];
  const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => escapeCell(row[key as keyof Submission])).join(',')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SubmissionsManager({
  exams,
  selectedExamId,
  setSelectedExamId,
  submissions,
  setSubmissions,
  loading,
  setLoading,
  setNotice,
  setError,
}: SubmissionsManagerProps) {
  const [search, setSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  const filteredSubmissions = useMemo(() => {
    if (!search.trim()) return submissions;
    const q = search.trim().toLowerCase();
    return submissions.filter((row) =>
      [row.student_name, row.phone, row.email || '', row.status]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [submissions, search]);

  async function saveReview(submission: Submission) {
    setLoading(true);
    setError('');
    try {
      if (!submission.id) throw new Error('لا يوجد معرف للإجابة.');
      const updated = await updateSubmissionReview(
        submission.id,
        submission.admin_notes || '',
        submission.reviewed || false
      );
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      if (selectedSubmission?.id === updated.id) {
        setSelectedSubmission(updated);
      }
      setNotice('تم حفظ المراجعة والملاحظات.');
    } catch (err) {
      setError('تعذر حفظ المراجعة.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSubmission(submissionId: string) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الإجابة؟')) {
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await deleteSubmission(submissionId);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(null);
      }
      setNotice('تم حذف الإجابة بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? `تعذر حذف الإجابة: ${err.message}` : 'تعذر حذف الإجابة.');
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="admin-grid submissions-grid">
      <section className="tool-panel">
        <ExamPicker exams={exams} selectedExamId={selectedExamId} onSelect={setSelectedExamId} />
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو الهاتف" />
          </label>
          <button
            className="secondary-action"
            disabled={filteredSubmissions.length === 0}
            onClick={() => downloadCsv('submissions.csv', filteredSubmissions)}
            type="button"
          >
            <Download size={18} aria-hidden />
            CSV
          </button>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الهاتف</th>
                <th>النتيجة</th>
                <th>الحالة</th>
                <th>عرض</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((row) => (
                <tr key={row.id}>
                  <td>{row.student_name}</td>
                  <td>{row.phone}</td>
                  <td>{row.percentage.toFixed(1)}%</td>
                  <td>
                    <span className={`status-pill ${row.status}`}>
                      {row.status === 'passed' ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
                      {row.status === 'passed' ? 'ناجح' : 'راسب'}
                    </span>
                  </td>
                  <td>
                    <div className="item-actions">
                      <button className="ghost-action small" onClick={() => setSelectedSubmission(row)} type="button">
                        عرض
                      </button>
                      <button className="danger-action small" onClick={() => handleDeleteSubmission(row.id!)} type="button" disabled={loading}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSubmissions.length === 0 && (
                <tr>
                  <td colSpan={5}>لا توجد إجابات مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tool-panel details-panel">
        {selectedSubmission ? (
          <>
            <div className="section-heading compact">
              <span className="section-kicker">تفاصيل الطالب</span>
              <h3>{selectedSubmission.student_name}</h3>
            </div>
            <div className="details-grid">
              <span>الهاتف: {selectedSubmission.phone}</span>
              <span>النتيجة: {selectedSubmission.percentage.toFixed(1)}%</span>
              <span>النقاط: {selectedSubmission.score}</span>
              <span>المدة: {Math.round(selectedSubmission.duration_seconds / 60)} دقيقة</span>
            </div>
            <div className="answer-review-list compact-list">
              {selectedSubmission.answers.map((answer, index) => (
                <article className="answer-review" key={`${answer.question_id}-${index}`}>
                  <div className="answer-review-header">
                    <span>السؤال {index + 1}</span>
                    <strong className={answer.is_correct ? 'text-success' : 'text-danger'}>
                      {answer.is_correct ? 'صحيح' : 'خطأ'}
                    </strong>
                  </div>
                  <p>{answer.prompt}</p>
                  <dl>
                    <div>
                      <dt>إجابة الطالب</dt>
                      <dd>{answer.answer || 'بدون إجابة'}</dd>
                    </div>
                    <div>
                      <dt>الصحيح</dt>
                      <dd>{answer.correct_answer}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <label className="check-row">
              <input
                checked={Boolean(selectedSubmission.reviewed)}
                onChange={(event) => setSelectedSubmission((prev) => prev ? { ...prev, reviewed: event.target.checked } : prev)}
                type="checkbox"
              />
              <span>تمت المراجعة</span>
            </label>
            <label className="field full">
              <span>ملاحظات الإدارة</span>
              <textarea
                value={selectedSubmission.admin_notes || ''}
                onChange={(event) => setSelectedSubmission((prev) => prev ? { ...prev, admin_notes: event.target.value } : prev)}
                rows={3}
              />
            </label>
            <button className="primary-action" disabled={loading} onClick={() => saveReview(selectedSubmission)} type="button">
              {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <Save size={18} aria-hidden />}
              حفظ المراجعة
            </button>
          </>
        ) : (
          <div className="empty-state">اختر إجابة لعرض تفاصيلها.</div>
        )}
      </section>
    </div>
  );
}
