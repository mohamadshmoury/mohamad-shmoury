import {
  AlertTriangle,
  ArrowRight,
  Award,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearLegacyProgramSession,
  documentLabels,
  getParticipantPortfolio,
  IJAZAH_CLAIMS_CHANGED,
  loadParticipantClaims,
  removeParticipantClaims,
  requestEntitlement,
  retryGhawthaniSubmission,
  type GhawthaniGender,
  type ParticipantPortfolioEntry,
} from '../lib/ghawthaniService';

interface Props {
  onBack: () => void;
  onOpenLegacy: (slug: string) => void;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ar-LB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function availabilityText(entry: ParticipantPortfolioEntry) {
  if (entry.availability.state === 'scheduled') return `يبدأ الطلب في ${formatDate(entry.availability.available_from)}`;
  if (entry.availability.state === 'expired') return `انتهت فترة الطلب في ${formatDate(entry.availability.available_until)}`;
  if (entry.availability.state === 'inactive') return 'الطلب متوقف حاليًا';
  if (entry.availability.available_from && entry.availability.available_until) {
    return `متاح من ${formatDate(entry.availability.available_from)} حتى ${formatDate(entry.availability.available_until)}`;
  }
  if (entry.availability.available_until) return `متاح حتى ${formatDate(entry.availability.available_until)}`;
  return 'متاح دون تاريخ انتهاء';
}

function requestStatus(entry: ParticipantPortfolioEntry) {
  if (entry.revoked) return 'تم إيقاف الصلاحية';
  if (entry.claim_kind === 'open_program') {
    return entry.availability.available ? 'متاح للتقديم' : 'الطلب متوقف حاليًا';
  }
  if (!entry.request) {
    if (!entry.availability.available) {
      if (entry.availability.state === 'scheduled') return 'بانتظار بدء فترة الإتاحة';
      if (entry.availability.state === 'expired') return 'أُغلق باب الطلبات الجديدة';
      return 'الطلب متوقف حاليًا';
    }
    return 'متاح للطلب الآن';
  }
  if (entry.request.approval_status === 'pending_approval') return 'بانتظار موافقة الإدارة';
  if (entry.request.approval_status === 'rejected') return 'لم يُعتمد الطلب';
  if (entry.request.generation_status === 'completed') return 'تم الإصدار';
  if (entry.request.generation_status === 'failed') return 'تعذّر الإصدار';
  if (entry.request.generation_status === 'not_required') return 'لا توجد مستندات مستحقة';
  return 'الطلب قيد المعالجة';
}

function nextActionLabel(entry: ParticipantPortfolioEntry) {
  if (entry.revoked) return 'الإجراء التالي: راجع إدارة الدورة للاستفسار عن إيقاف الصلاحية.';
  if (entry.claim_kind === 'open_program') {
    return entry.availability.available
      ? 'الإجراء التالي: افتح استمارة الحضور لتعبئة البيانات وإصدار المستند.'
      : 'الإجراء التالي: لا تتاح طلبات جديدة حاليًا لهذه الدورة.';
  }
  if (!entry.request) {
    if (entry.availability.available) return 'الإجراء التالي: اضغط «بدء الطلب» لتأكيد الاسم وإصدار المستند.';
    if (entry.availability.state === 'scheduled') return `الإجراء التالي: العودة بعد ${formatDate(entry.availability.available_from)} لتقديم الطلب.`;
    return 'الإجراء التالي: لا تتاح طلبات جديدة حاليًا لهذه الدورة.';
  }
  if (entry.request.approval_status === 'pending_approval') {
    return 'الإجراء التالي: الطلب قيد المراجعة الإدارية، وستظهر المستندات للتنزيل هنا فور الاعتماد.';
  }
  if (entry.request.approval_status === 'rejected') {
    return 'الإجراء التالي: راجع ملاحظة الإدارة أو تواصل مع المشرفين.';
  }
  if (entry.request.generation_status === 'failed') {
    return entry.availability.available
      ? 'الإجراء التالي: أعد محاولة الإصدار أو عدّل الاسم إذا كان طويلًا.'
      : 'الإجراء التالي: تواصل مع الإدارة لإعادة توليد المستند.';
  }
  if (entry.request.generation_status === 'completed' && entry.documents.length > 0) {
    return 'الإجراء التالي: تنزيل المستندات من قسم «المستندات الصادرة سابقًا».';
  }
  return '';
}

export default function CertificatesHub({ onBack, onOpenLegacy }: Props) {
  const [entries, setEntries] = useState<ParticipantPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invalidAccessNotice, setInvalidAccessNotice] = useState('');
  const [activeClaim, setActiveClaim] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<GhawthaniGender | ''>('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const attemptedUrlClaim = sessionStorage.getItem('shmoury_ijazah_url_claim_attempt') || '';
      const result = await getParticipantPortfolio();
      setEntries(result.entries);
      if (result.invalid_claims.length) {
        if (
          attemptedUrlClaim &&
          result.invalid_claims.some((item) => `${item.kind}:${item.id}` === attemptedUrlClaim)
        ) {
          setInvalidAccessNotice('تعذر التحقق من صلاحية رابط الوصول الذي فتحته، أو أن رمز الوصول غير صالح. يرجى التأكد من فتح الرابط الكامل المرسل من الإدارة.');
        } else if (result.entries.length === 0) {
          setInvalidAccessNotice('انتهت صلاحية رابط الوصول المحفوظ أو أنه غير صالح.');
        }
        sessionStorage.removeItem('shmoury_ijazah_url_claim_attempt');
        removeParticipantClaims(result.invalid_claims);
      } else if (attemptedUrlClaim) {
        sessionStorage.removeItem('shmoury_ijazah_url_claim_attempt');
        setInvalidAccessNotice('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الإجازات والشهادات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(IJAZAH_CLAIMS_CHANGED, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(IJAZAH_CLAIMS_CHANGED, load);
      window.removeEventListener('storage', load);
    };
  }, [load]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ParticipantPortfolioEntry[]>();
    for (const entry of entries) {
      const rows = groups.get(entry.program.id) || [];
      rows.push(entry);
      groups.set(entry.program.id, rows);
    }
    return [...groups.values()];
  }, [entries]);

  function begin(entry: ParticipantPortfolioEntry) {
    setActiveClaim(entry.claim_id);
    setFullName(entry.full_name);
    setGender(entry.gender || '');
    setAcknowledged(false);
    setError('');
  }

  async function submit(event: FormEvent, entry: ParticipantPortfolioEntry) {
    event.preventDefault();
    if (fullName.trim().length < 3 || !gender || !acknowledged) {
      setError('أكمل الاسم والجنس، ثم أكّد صحة البيانات.');
      return;
    }
    const claim = loadParticipantClaims().find((item) => item.kind === 'entitlement' && item.id === entry.claim_id);
    if (!claim) {
      setError('رابط الوصول غير متاح. افتح الرابط الذي زوّدتك به الإدارة.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await requestEntitlement({
        entitlement_id: entry.claim_id,
        access_token: claim.token,
        full_name: fullName.trim(),
        gender,
        acknowledged: true,
      });
      setActiveClaim('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryLegacySubmission(entry: ParticipantPortfolioEntry) {
    const claim = loadParticipantClaims().find((item) => item.kind === 'submission' && item.id === entry.claim_id);
    if (!claim) {
      onOpenLegacy(entry.program.slug);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await retryGhawthaniSubmission({
        submission_id: entry.claim_id,
        access_token: claim.token,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعادة محاولة الإصدار.');
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherParticipant(programSlug: string) {
    clearLegacyProgramSession(programSlug);
    onOpenLegacy(programSlug);
  }

  return (
    <main className="certificates-page" dir="rtl">
      <section className="certificates-hero">
        <button className="gh-back" type="button" onClick={onBack}><ArrowRight size={18} aria-hidden /> العودة إلى المنصة</button>
        <span><Award size={19} aria-hidden /> مستنداتك المعتمدة</span>
        <h1>الإجازات والشهادات</h1>
        <p>تظهر هنا الطلبات المتاحة لك والمستندات التي سبق إصدارها، مرتبة حسب الدورة.</p>
      </section>

      {loading && <div className="certificates-state"><Loader2 className="spin" size={28} aria-hidden /><strong>جاري تحميل مستنداتك…</strong></div>}
      {invalidAccessNotice && (
        <div className="gh-alert error certificates-alert" role="alert">
          <Ban size={18} aria-hidden />
          <span>{invalidAccessNotice}</span>
        </div>
      )}
      {error && <div className="gh-alert error certificates-alert"><AlertTriangle size={18} aria-hidden />{error}</div>}
      {!loading && grouped.length === 0 && (
        <div className="certificates-state">
          <FileText size={34} aria-hidden />
          <strong>لا توجد طلبات أو مستندات متاحة على هذا المتصفح.</strong>
          <p>بعد النجاح في دورة مؤهلة أو فتح رابط من الإدارة، ستظهر الدورة هنا تلقائيًا.</p>
        </div>
      )}

      <div className="certificates-courses">
        {grouped.map((courseEntries) => {
          const program = courseEntries[0].program;
          const issued = courseEntries.flatMap((entry) =>
            (entry.revoked ? [] : entry.documents).map((document) => ({ entry, document })),
          );
          return (
            <section className="certificate-course" key={program.id}>
              <header>
                <div>
                  <small>الدورة</small>
                  <h2>{program.title}</h2>
                  <p>{program.course_subject} — {program.instructor_name}</p>
                </div>
                <span className={`availability ${courseEntries[0].availability.state}`}>
                  <CalendarClock size={16} aria-hidden />
                  {availabilityText(courseEntries[0])}
                </span>
              </header>

              <div className="certificate-columns">
                <section>
                  <h3>الطلبات المتاحة</h3>
                  {courseEntries.map((entry) => {
                    const eligibleLabels = entry.eligible_document_types
                      .map((type) => documentLabels[type])
                      .filter((value, index, values) => values.indexOf(value) === index);
                    const statusLabel = requestStatus(entry);
                    const nextAction = nextActionLabel(entry);
                    return (
                      <article className="certificate-request" key={`${entry.claim_kind}:${entry.claim_id}`}>
                        <div>
                          <strong>{eligibleLabels.length > 0 ? eligibleLabels.join(' و ') : 'لا توجد مستندات مؤهلة'}</strong>
                          <small className={`request-status-pill ${entry.revoked ? 'is-revoked' : entry.request?.approval_status === 'pending_approval' ? 'is-pending' : entry.request?.generation_status || 'unrequested'}`}>
                            {statusLabel}
                          </small>
                        </div>

                        {entry.revoked && (
                          <div className="request-status-box error">
                            <Ban size={16} aria-hidden />
                            <span>
                              تم إلغاء صلاحية الوصول إلى مستندات هذه الدورة من قِبل الإدارة.
                              {entry.revoked_reason ? ` السبب: ${entry.revoked_reason}` : ''}
                            </span>
                          </div>
                        )}

                        {!entry.revoked && entry.request?.approval_status === 'pending_approval' && (
                          <div className="request-status-box warning">
                            <Clock3 size={16} aria-hidden />
                            <span>الطلب قيد المراجعة وبانتظار موافقة الإدارة لإصدار المستندات.</span>
                          </div>
                        )}

                        {!entry.revoked && entry.request?.approval_status === 'rejected' && (
                          <div className="request-status-box error">
                            <AlertTriangle size={16} aria-hidden />
                            <span>
                              تعذر اعتماد الطلب من قِبل الإدارة.
                              {entry.request.approval_note ? ` ملاحظة الإدارة: ${entry.request.approval_note}` : ''}
                            </span>
                          </div>
                        )}

                        {!entry.revoked && entry.request?.generation_error && entry.request?.approval_status !== 'rejected' && (
                          <p className="request-error">{entry.request.generation_error}</p>
                        )}

                        {!entry.revoked && !entry.availability.available && (!entry.request || entry.request.generation_status !== 'completed') && (
                          <p className="request-note">
                            {availabilityText(entry)}. لا يمكن إنشاء طلب جديد أو إصدار مستند خارج فترة الإتاحة.
                          </p>
                        )}

                        {nextAction && <p className="request-next-action">{nextAction}</p>}

                        {!entry.revoked && entry.availability.available && entry.claim_kind === 'open_program' && (
                          <button className="primary-action" type="button" onClick={() => startAnotherParticipant(program.slug)}>
                            بدء استمارة الحضور والطلب
                          </button>
                        )}

                        {!entry.revoked && entry.availability.available && entry.claim_kind === 'entitlement' && (!entry.request || (entry.request.generation_status === 'failed' && entry.request.approval_status !== 'rejected')) && activeClaim !== entry.claim_id && (
                          <button className="primary-action" type="button" onClick={() => begin(entry)}>
                            {entry.request ? 'إعادة محاولة الإصدار' : 'بدء الطلب'}
                          </button>
                        )}

                        {!entry.revoked && entry.availability.available && entry.claim_kind === 'submission' && entry.request?.generation_status === 'failed' && entry.request?.approval_status !== 'rejected' && (
                          <div className="item-actions">
                            <button className="primary-action" disabled={submitting} type="button" onClick={() => retryLegacySubmission(entry)}>
                              {submitting ? <Loader2 className="spin" size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />}
                              إعادة محاولة الإصدار
                            </button>
                            <button className="secondary-action" type="button" onClick={() => onOpenLegacy(program.slug)}>
                              فتح الطلب الأصلي
                            </button>
                          </div>
                        )}

                        {activeClaim === entry.claim_id && !entry.revoked && (
                          <form className="certificate-claim-form" onSubmit={(event) => submit(event, entry)}>
                            <label>
                              <span>الاسم كما سيظهر على المستند</span>
                              <input value={fullName} maxLength={120} onChange={(event) => setFullName(event.target.value)} />
                            </label>
                            <fieldset>
                              <legend>الجنس</legend>
                              <label><input type="radio" checked={gender === 'male'} onChange={() => setGender('male')} /> ذكر</label>
                              <label><input type="radio" checked={gender === 'female'} onChange={() => setGender('female')} /> أنثى</label>
                            </fieldset>
                            {program.requires_approval && (
                              <p className="claim-approval-note">
                                <Clock3 size={15} aria-hidden /> سيُحال الطلب بعد الإرسال إلى إدارة الدورة للاعتماد قبل توليد ملف PDF.
                              </p>
                            )}
                            <label className="claim-confirm">
                              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                              <span>أؤكد صحة الاسم والبيانات للطباعة.</span>
                            </label>
                            <div>
                              <button className="primary-action" disabled={submitting} type="submit">
                                {submitting ? <Loader2 className="spin" size={17} aria-hidden /> : <CheckCircle2 size={17} aria-hidden />}
                                إرسال الطلب
                              </button>
                              <button className="ghost-action" type="button" onClick={() => setActiveClaim('')}>إلغاء</button>
                            </div>
                          </form>
                        )}
                      </article>
                    );
                  })}
                  {program.eligibility_method === 'legacy_attendance'
                    && courseEntries[0].availability.available
                    && !courseEntries.some((entry) => entry.claim_kind === 'open_program') && (
                    <div className="certificate-new-participant">
                      <div>
                        <strong>طلب لشخص آخر</strong>
                        <p>ابدأ استمارة جديدة على هذا المتصفح مع الإبقاء على المستندات الصادرة سابقًا.</p>
                      </div>
                      <button className="primary-action" type="button" onClick={() => startAnotherParticipant(program.slug)}>
                        <RotateCcw size={17} aria-hidden /> تقديم طلب لشخص آخر
                      </button>
                    </div>
                  )}
                </section>

                <section>
                  <h3>المستندات الصادرة سابقًا</h3>
                  {issued.length === 0 ? (
                    <p className="empty-issued">
                      {courseEntries.some((entry) => entry.revoked)
                        ? 'تم إيقاف إتاحة تنزيل المستندات لهذه الدورة من قِبل الإدارة.'
                        : 'لم يصدر مستند بعد.'}
                    </p>
                  ) : (
                    issued.map(({ document }) => (
                      <a className="issued-document" href={document.download_url} key={document.id} target="_blank" rel="noreferrer" download>
                        <span>
                          <Download size={19} aria-hidden />
                          <strong>{documentLabels[document.document_type]}</strong>
                        </span>
                        <small>{document.issued_at ? `صدر في ${formatDate(document.issued_at)}` : 'جاهز للتنزيل'}</small>
                      </a>
                    ))
                  )}
                  {issued.length > 0 && !courseEntries[0].availability.available && (
                    <p className="issued-preserved">
                      <CheckCircle2 size={16} aria-hidden />
                      تبقى المستندات الصادرة متاحة للتنزيل بعد انتهاء فترة الطلب.
                    </p>
                  )}
                </section>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
